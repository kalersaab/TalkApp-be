import { Types } from 'mongoose';

import { StreakModel } from '@models/streak.model';
import { UserModel } from '@models/users.model';
import { getRedisService } from '@databases/redis';
import { AchievementService } from '@services/achievement.service';
import { logger } from '@utils/logger';

const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 100, 365]);

function toUTCDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcToday(): string {
  return toUTCDateString(new Date());
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  isNewRecord: boolean;
  milestoneReached: number | null;
}

export interface DailyStreakStatus {
  hasChattedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export class StreakService {
  private readonly achievementService = new AchievementService();

  async checkAndUpdateStreak(userId: string): Promise<StreakUpdateResult> {
    const today = utcToday();
    const redis = getRedisService();

    try {
      const cached = await redis.getStreak(userId).catch(() => null);

      let currentStreak: number;
      let longestStreak: number;
      let lastActiveDateStr: string | null;

      if (cached) {
        currentStreak = cached.currentStreak;
        longestStreak = cached.longestStreak;
        lastActiveDateStr = cached.lastActiveDate;
      } else {
        const doc = await StreakModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
        if (!doc) {
          await StreakModel.create({
            userId: new Types.ObjectId(userId),
            currentStreak: 1,
            longestStreak: 1,
            lastActiveDate: new Date(),
          });
          await this.syncUserFields(userId, 1, 1);
          const result: StreakUpdateResult = {
            currentStreak: 1,
            longestStreak: 1,
            isNewRecord: true,
            milestoneReached: null,
          };
          await this.writeCache(userId, 1, 1, today);
          return result;
        }
        currentStreak = doc.currentStreak;
        longestStreak = doc.longestStreak;
        lastActiveDateStr = toUTCDateString(doc.lastActiveDate);
      }

      if (lastActiveDateStr === today) {
        return { currentStreak, longestStreak, isNewRecord: false, milestoneReached: null };
      }

      const yesterday = toUTCDateString(new Date(Date.now() - 86_400_000));
      let newStreak: number;

      if (lastActiveDateStr === yesterday) {
        newStreak = currentStreak + 1;
      } else {
        newStreak = 1;
      }

      const newLongest = Math.max(newStreak, longestStreak);
      const isNewRecord = newStreak > longestStreak;

      await StreakModel.updateOne(
        { userId: new Types.ObjectId(userId) },
        {
          $set: {
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastActiveDate: new Date(),
          },
        },
      );

      await this.syncUserFields(userId, newStreak, newLongest);

      await this.writeCache(userId, newStreak, newLongest, today);

      const milestoneReached = STREAK_MILESTONES.has(newStreak) ? newStreak : null;
      if (milestoneReached !== null) {
        void this.achievementService
          .checkStreakAchievements(userId, newStreak)
          .catch(err => logger.warn(`[StreakService] achievement check failed: ${(err as Error).message}`));
      }

      logger.debug(`[StreakService] user ${userId}: ${currentStreak} → ${newStreak} (record=${isNewRecord})`);

      return { currentStreak: newStreak, longestStreak: newLongest, isNewRecord, milestoneReached };
    } catch (err) {
      logger.error(`[StreakService] checkAndUpdateStreak failed for ${userId}: ${(err as Error).message}`);

      return { currentStreak: 0, longestStreak: 0, isNewRecord: false, milestoneReached: null };
    }
  }

  async getDailyStreakStatus(userId: string): Promise<DailyStreakStatus> {
    const today = utcToday();
    const redis = getRedisService();

    try {
      const cached = await redis.getStreak(userId).catch(() => null);

      if (cached) {
        return {
          hasChattedToday: cached.lastActiveDate === today,
          currentStreak: cached.currentStreak,
          longestStreak: cached.longestStreak,
          lastActiveDate: cached.lastActiveDate,
        };
      }

      const doc = await StreakModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
      if (!doc) {
        return { hasChattedToday: false, currentStreak: 0, longestStreak: 0, lastActiveDate: null };
      }

      const lastActiveDateStr = toUTCDateString(doc.lastActiveDate);
      return {
        hasChattedToday: lastActiveDateStr === today,
        currentStreak: doc.currentStreak,
        longestStreak: doc.longestStreak,
        lastActiveDate: lastActiveDateStr,
      };
    } catch (err) {
      logger.error(`[StreakService] getDailyStreakStatus failed for ${userId}: ${(err as Error).message}`);
      return { hasChattedToday: false, currentStreak: 0, longestStreak: 0, lastActiveDate: null };
    }
  }

  private async syncUserFields(userId: string, currentStreak: number, longestStreak: number): Promise<void> {
    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { currentStreak, longestStreak, lastActiveDate: new Date() } });
  }

  private async writeCache(userId: string, currentStreak: number, longestStreak: number, lastActiveDate: string): Promise<void> {
    await getRedisService()
      .setStreak(userId, { currentStreak, longestStreak, lastActiveDate })
      .catch(() => null);
  }
}
