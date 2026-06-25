import { Types } from 'mongoose';

import { AchievementModel } from '@models/achievement.model';
import { InventoryModel } from '@models/inventory.model';
import { UserModel } from '@models/users.model';
import { FollowModel } from '@models/follow.model';
import { PostModel } from '@models/post.model';
import { ConversationModel } from '@models/conversation.model';
import { getRedisService } from '@databases/redis';
import { getIO } from '@sockets/gateway.registry';
import type { IAchievement, IInventory, CollectorRank, MedalTier, ItemType } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

// ─── Achievement → unlockable item mapping ────────────────────────────────────

interface UnlockableItem {
  itemId: string;
  itemType: ItemType;
}

const ACHIEVEMENT_ITEM_MAP: Record<string, UnlockableItem> = {
  streak_7: { itemId: 'avatar_effect_flame', itemType: 'avatarEffect' },
  streak_30: { itemId: 'chat_bubble_gold', itemType: 'chatBubble' },
  streak_100: { itemId: 'chat_background_legend', itemType: 'chatBackground' },
  followers_100: { itemId: 'avatar_effect_crown', itemType: 'avatarEffect' },
  post_popular: { itemId: 'chat_bubble_star', itemType: 'chatBubble' },
  partners_10: { itemId: 'chat_background_world', itemType: 'chatBackground' },
} as const;

// ─── Collector rank thresholds ────────────────────────────────────────────────

const RANK_THRESHOLDS: Array<{ min: number; rank: CollectorRank }> = [
  { min: 51, rank: 'legendary' },
  { min: 31, rank: 'elite' },
  { min: 16, rank: 'senior' },
  { min: 6, rank: 'collector' },
  { min: 0, rank: 'junior' },
];

function itemCountToRank(count: number): CollectorRank {
  return RANK_THRESHOLDS.find(t => count >= t.min)?.rank ?? 'junior';
}

// ─── Return type ──────────────────────────────────────────────────────────────

export interface AwardResult {
  achievement: IAchievement;
  unlockedItem: UnlockableItem | null;
  newRank: CollectorRank | null;
}

// ─── AchievementService ───────────────────────────────────────────────────────

export class AchievementService {
  // ── awardAchievement ─────────────────────────────────────────────────────────

  async awardAchievement(userId: string, achievementType: string, medalTier: MedalTier): Promise<AwardResult | null> {
    // 1. Idempotency check — skip if already earned
    const existing = await AchievementModel.findOne({
      userId: new Types.ObjectId(userId),
      achievementType,
    });
    if (existing) return null;

    // 2. Create achievement document
    const achievement = await AchievementModel.create({
      userId: new Types.ObjectId(userId),
      achievementType,
      medalTier,
      earnedAt: new Date(),
    });

    // 3. Update denormalised medal count on User
    await this.updateMedalCount(userId);

    // 4. Unlock item if this achievement has one
    const itemDef = ACHIEVEMENT_ITEM_MAP[achievementType] ?? null;
    let unlockedItem: UnlockableItem | null = null;
    if (itemDef) {
      await this.addToInventory(userId, itemDef.itemId, itemDef.itemType);
      unlockedItem = itemDef;
    }

    // 5. Recalculate collector rank
    const newRank = await this.recalculateCollectorRank(userId);

    // 6. Emit WebSocket event to user's personal room
    this.emitAchievementUnlocked(userId, achievement, unlockedItem, newRank);

    logger.info(`[AchievementService] awarded ${achievementType} (${medalTier}) to user ${userId}`);

    return { achievement, unlockedItem, newRank };
  }

  // ── updateMedalCount ─────────────────────────────────────────────────────────

  async updateMedalCount(userId: string): Promise<void> {
    const count = await AchievementModel.countDocuments({
      userId: new Types.ObjectId(userId),
    });
    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { totalMedalCount: count } });
  }

  // ── recalculateCollectorRank ──────────────────────────────────────────────────

  async recalculateCollectorRank(userId: string): Promise<CollectorRank | null> {
    const inventory = await InventoryModel.findOne({
      userId: new Types.ObjectId(userId),
    }).lean<IInventory>();

    const itemCount = inventory?.itemCount ?? 0;
    const newRank = itemCountToRank(itemCount);

    const user = await UserModel.findById(userId).select('collectorRank').lean();
    if (!user) return null;

    const oldRank = user.collectorRank as CollectorRank;
    if (oldRank === newRank) return null; // no change

    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { collectorRank: newRank } });

    // Sync rank on inventory document too
    await InventoryModel.updateOne({ userId: new Types.ObjectId(userId) }, { $set: { collectorRank: newRank } });

    // Bust profile cache
    await getRedisService()
      .invalidateProfile(`profile:full:${userId}`)
      .catch(() => null);

    // Emit rank change via WebSocket
    this.emitRankChanged(userId, oldRank, newRank);

    logger.info(`[AchievementService] rank ${oldRank} → ${newRank} for user ${userId}`);
    return newRank;
  }

  // ── addToInventory ────────────────────────────────────────────────────────────

  async addToInventory(userId: string, itemId: string, itemType: ItemType): Promise<IInventory | null> {
    const updated = await InventoryModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $addToSet: {
          items: { itemId, itemType, unlockedAt: new Date() },
        },
      },
      { new: true },
    ).lean<IInventory>();

    if (!updated) return null;

    // Keep itemCount in sync
    await InventoryModel.updateOne({ userId: new Types.ObjectId(userId) }, { $set: { itemCount: updated.items.length } });

    // Bust inventory cache
    await getRedisService()
      .invalidateInventory(userId)
      .catch(() => null);

    return updated;
  }

  // ── checkStreakAchievements ───────────────────────────────────────────────────

  async checkStreakAchievements(userId: string, currentStreak: number): Promise<void> {
    const checks: Array<{ type: string; threshold: number; tier: MedalTier }> = [
      { type: 'streak_3', threshold: 3, tier: 'bronze' },
      { type: 'streak_7', threshold: 7, tier: 'silver' },
      { type: 'streak_30', threshold: 30, tier: 'gold' },
      { type: 'streak_100', threshold: 100, tier: 'platinum' },
    ];

    for (const check of checks) {
      if (currentStreak >= check.threshold) {
        await this.awardAchievement(userId, check.type, check.tier);
      }
    }
  }

  // ── checkFollowAchievements ───────────────────────────────────────────────────

  async checkFollowAchievements(userId: string): Promise<void> {
    const uid = new Types.ObjectId(userId);

    // How many people this user follows
    const followingCount = await FollowModel.countDocuments({ followerId: uid });
    // How many followers this user has
    const followersCount = await FollowModel.countDocuments({ followingId: uid });

    if (followingCount >= 1) {
      await this.awardAchievement(userId, 'first_follow', 'bronze');
    }
    if (followersCount >= 10) {
      await this.awardAchievement(userId, 'followers_10', 'silver');
    }
    if (followersCount >= 100) {
      await this.awardAchievement(userId, 'followers_100', 'gold');
    }
    if (followersCount >= 1000) {
      await this.awardAchievement(userId, 'followers_1000', 'platinum');
    }
  }

  // ── checkPostAchievements ─────────────────────────────────────────────────────

  async checkPostAchievements(userId: string, postLikeCount?: number): Promise<void> {
    const uid = new Types.ObjectId(userId);
    const postCount = await PostModel.countDocuments({ userId: uid });

    if (postCount >= 1) {
      await this.awardAchievement(userId, 'first_post', 'bronze');
    }
    if (postCount >= 10) {
      await this.awardAchievement(userId, 'posts_10', 'silver');
    }
    if (postLikeCount !== undefined && postLikeCount >= 50) {
      await this.awardAchievement(userId, 'post_popular', 'gold');
    }
  }

  // ── checkChatAchievements ─────────────────────────────────────────────────────

  async checkChatAchievements(userId: string, totalMessagesSent: number): Promise<void> {
    const uid = new Types.ObjectId(userId);

    if (totalMessagesSent >= 1) {
      await this.awardAchievement(userId, 'first_message', 'bronze');
    }
    if (totalMessagesSent >= 100) {
      await this.awardAchievement(userId, 'messages_100', 'silver');
    }

    // Count distinct conversation partners
    const conversations = await ConversationModel.find({
      participantIds: uid,
    })
      .select('participantIds')
      .lean();

    const partnerCount = new Set(conversations.flatMap(c => c.participantIds.map(id => id.toString()).filter(id => id !== userId))).size;

    if (partnerCount >= 10) {
      await this.awardAchievement(userId, 'partners_10', 'gold');
    }
  }

  // ── Private: WebSocket emitters ───────────────────────────────────────────────

  private emitAchievementUnlocked(
    userId: string,
    achievement: IAchievement,
    unlockedItem: UnlockableItem | null,
    newRank: CollectorRank | null,
  ): void {
    try {
      getIO()?.to(`user:${userId}`).emit('achievement_unlocked', {
        achievementType: achievement.achievementType,
        medalTier: achievement.medalTier,
        earnedAt: achievement.earnedAt.toISOString(),
        unlockedItem,
        newRank,
      });
    } catch {
      // Gateway may not be initialised in tests — swallow silently
    }
  }

  private emitRankChanged(userId: string, oldRank: string, newRank: string): void {
    try {
      getIO()?.to(`user:${userId}`).emit('rank_changed', { oldRank, newRank });
    } catch {
      // Swallow — non-critical
    }
  }
}
