import admin from 'firebase-admin';
import apn from '@parse/node-apn';

import {
  FCM_PROJECT_ID,
  FCM_CLIENT_EMAIL,
  FCM_PRIVATE_KEY,
  APNS_KEY_ID,
  APNS_TEAM_ID,
  APNS_KEY_BASE64,
  APNS_BUNDLE_ID,
  APNS_PRODUCTION,
} from '@config';
import { DeviceTokenModel } from '@models/deviceToken.model';
import { NotificationLogModel } from '@models/notificationLog.model';
import { UserModel } from '@models/users.model';
import type {
  NotificationPayload,
  DeliveryTarget,
  DeliveryResult,
  SenderProfile,
  AchievementInfo,
  NotificationPreferences,
} from '@interfaces/notification.interface';
import type { NotificationType } from '@models/notificationLog.model';
import { logger } from '@utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const FCM_BATCH_SIZE   = 500;
const MAX_RETRIES      = 3;
const BASE_RETRY_MS    = 500;
const LIKE_MILESTONES  = new Set([10, 50, 100, 500]);

// ─── FCM singleton ────────────────────────────────────────────────────────────

let _fcmApp: admin.app.App | null = null;

function getFCMApp(): admin.app.App {
  if (!_fcmApp) {
    if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) {
      throw new Error('FCM credentials not configured');
    }
    _fcmApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FCM_PROJECT_ID,
        clientEmail: FCM_CLIENT_EMAIL,
        privateKey:  Buffer.from(FCM_PRIVATE_KEY, 'base64').toString('utf8'),
      }),
    }, 'talkapp-fcm');
  }
  return _fcmApp;
}

// ─── APNs singleton ───────────────────────────────────────────────────────────

let _apnProvider: apn.Provider | null = null;

function getAPNsProvider(): apn.Provider {
  if (!_apnProvider) {
    if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY_BASE64) {
      throw new Error('APNs credentials not configured');
    }
    _apnProvider = new apn.Provider({
      token: {
        key:    Buffer.from(APNS_KEY_BASE64, 'base64').toString('utf8'),
        keyId:  APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: APNS_PRODUCTION === 'true',
    });
  }
  return _apnProvider;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── NotificationService ──────────────────────────────────────────────────────

export class NotificationService {

  // ── Token management ─────────────────────────────────────────────────────────

  async saveDeviceToken(
    userId: string,
    platform: 'android' | 'ios',
    token: string,
  ): Promise<void> {
    await DeviceTokenModel.findOneAndUpdate(
      { userId, platform },
      { $set: { token, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async updatePreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<void> {
    const update: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(prefs)) {
      if (v !== undefined) update[`notificationPrefs.${k}`] = v as boolean;
    }
    if (Object.keys(update).length) {
      await UserModel.updateOne({ _id: userId }, { $set: update });
    }
  }

  // ── Public send methods ───────────────────────────────────────────────────────

  async sendMessageNotification(
    recipientId: string,
    message: { content: string; convId: string; msgId: string },
    sender: SenderProfile,
  ): Promise<void> {
    if (!(await this.prefEnabled(recipientId, 'messages'))) return;

    await this.deliver(recipientId, 'message', {
      title: sender.displayName,
      body:  truncate(message.content, 100),
      data:  { type: 'message', convId: message.convId, msgId: message.msgId },
      badge: 1,
      sound: 'default',
    });
  }

  async sendFollowNotification(
    followedUserId: string,
    follower: SenderProfile,
  ): Promise<void> {
    if (!(await this.prefEnabled(followedUserId, 'follows'))) return;

    await this.deliver(followedUserId, 'follow', {
      title: 'New Follower',
      body:  `${follower.displayName} started following you`,
      data:  { type: 'follow', followerId: follower._id },
      sound: 'default',
    });
  }

  async sendAchievementPush(
    userId: string,
    achievement: AchievementInfo,
  ): Promise<void> {
    if (!(await this.prefEnabled(userId, 'achievements'))) return;

    await this.deliver(userId, 'achievement', {
      title: 'Achievement Unlocked! 🏅',
      body:  `You earned: ${achievement.name}`,
      data:  {
        type:            'achievement',
        achievementType: achievement.achievementType,
        medalTier:       achievement.medalTier,
      },
      sound: 'achievement.caf',
    });
  }

  async sendPostLikeNotification(
    postOwnerId: string,
    liker: SenderProfile,
    post: { _id: string; likeCount: number },
  ): Promise<void> {
    if (!LIKE_MILESTONES.has(post.likeCount)) return;
    if (!(await this.prefEnabled(postOwnerId, 'posts'))) return;

    await this.deliver(postOwnerId, 'post_like', {
      title: 'Your post is popular! 🔥',
      body:  `${post.likeCount} people liked your post`,
      data:  { type: 'post_like', postId: post._id.toString(), likeCount: String(post.likeCount) },
      sound: 'default',
    });
  }

  // ── Core delivery pipeline ────────────────────────────────────────────────────

  private async deliver(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    const tokens = await DeviceTokenModel.find({ userId }).lean();
    if (!tokens.length) return;

    const targets: DeliveryTarget[] = tokens.map(t => ({
      userId,
      platform: t.platform,
      token:    t.token,
    }));

    // Split into FCM_BATCH_SIZE chunks
    for (let i = 0; i < targets.length; i += FCM_BATCH_SIZE) {
      const batch = targets.slice(i, i + FCM_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(t => this.sendWithRetry(t, payload, type)),
      );

      // Handle invalid tokens
      const invalids = results
        .map((r, idx) => ({ r, target: batch[idx]! }))
        .filter(({ r }) => r.status === 'fulfilled' && (r.value as DeliveryResult).invalidToken);

      if (invalids.length) {
        await DeviceTokenModel.deleteMany({
          token: { $in: invalids.map(({ target }) => target.token) },
        });
        logger.info(`[Notifications] Removed ${invalids.length} invalid token(s) for user ${userId}`);
      }
    }
  }

  // ── Retry wrapper ─────────────────────────────────────────────────────────────

  private async sendWithRetry(
    target: DeliveryTarget,
    payload: NotificationPayload,
    type: NotificationType,
    attempt = 1,
  ): Promise<DeliveryResult> {
    try {
      const result = target.platform === 'android'
        ? await this.sendFCM(target, payload)
        : await this.sendAPNs(target, payload);

      await this.log(target, type, result.success ? 'sent' : 'failed', null, attempt);
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_RETRY_MS * 2 ** (attempt - 1));
        return this.sendWithRetry(target, payload, type, attempt + 1);
      }
      const msg = (err as Error).message;
      await this.log(target, type, 'failed', msg, attempt);
      logger.error(`[Notifications] Failed after ${MAX_RETRIES} attempts for user ${target.userId}: ${msg}`);
      return { userId: target.userId, platform: target.platform, success: false, invalidToken: false, error: msg };
    }
  }

  // ── FCM (Android) ─────────────────────────────────────────────────────────────

  private async sendFCM(
    target: DeliveryTarget,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const base: DeliveryResult = { userId: target.userId, platform: 'android', success: false, invalidToken: false };

    try {
      await getFCMApp().messaging().send({
        token: target.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: {
          priority: 'high',
          ttl: 86400 * 1000, // 24h in ms
          notification: { sound: payload.sound ?? 'default' },
        },
      });
      return { ...base, success: true };
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      const invalidToken = code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token';

      if (invalidToken) {
        return { ...base, invalidToken: true, error: code };
      }
      throw err;
    }
  }

  // ── APNs (iOS) ────────────────────────────────────────────────────────────────

  private async sendAPNs(
    target: DeliveryTarget,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const base: DeliveryResult = { userId: target.userId, platform: 'ios', success: false, invalidToken: false };

    const note = new apn.Notification();
    note.expiry    = Math.floor(Date.now() / 1000) + 86400;
    note.badge     = payload.badge ?? 1;
    note.sound     = payload.sound ?? 'default';
    note.alert     = { title: payload.title, body: payload.body };
    note.payload   = payload.data;
    note.topic     = APNS_BUNDLE_ID ?? 'com.yourcompany.talkapp';

    const result = await getAPNsProvider().send(note, target.token);

    if (result.failed.length) {
      const reason = result.failed[0]?.response?.reason ?? 'Unknown';
      const invalidToken = reason === 'BadDeviceToken' || reason === 'Unregistered';
      return { ...base, invalidToken, error: reason };
    }

    return { ...base, success: true };
  }

  // ── Preference check ──────────────────────────────────────────────────────────

  private async prefEnabled(
    userId: string,
    key: keyof NotificationPreferences,
  ): Promise<boolean> {
    const user = await UserModel.findById(userId)
      .select('notificationPrefs')
      .lean() as { notificationPrefs?: Record<string, boolean> } | null;

    // Default to enabled if prefs not set
    return user?.notificationPrefs?.[key] !== false;
  }

  // ── Logging ───────────────────────────────────────────────────────────────────

  private async log(
    target: DeliveryTarget,
    type: NotificationType,
    status: 'sent' | 'failed' | 'invalid_token',
    errorMessage: string | null,
    attempt: number,
  ): Promise<void> {
    await NotificationLogModel.create({
      userId:       target.userId,
      platform:     target.platform,
      type,
      status,
      errorMessage,
      attempt,
    }).catch(err =>
      logger.warn(`[Notifications] Log write failed: ${(err as Error).message}`),
    );

    logger.info(
      `[Notifications] user=${target.userId} platform=${target.platform} ` +
      `type=${type} status=${status} attempt=${attempt}`,
    );
  }
}
