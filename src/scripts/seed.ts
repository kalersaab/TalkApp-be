/**
 * Database seed script — creates realistic test data for development.
 * Run with:  npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
 */

import { hash } from 'bcrypt';
import mongoose from 'mongoose';

import { dbConnect, dbDisconnect } from '@databases';
import { UserModel } from '@models/users.model';
import { ConversationModel } from '@models/conversation.model';
import { FollowModel } from '@models/follow.model';
import { PostModel } from '@models/post.model';
import { AchievementModel } from '@models/achievement.model';
import { InventoryModel } from '@models/inventory.model';
import { StreakModel } from '@models/streak.model';
import { logger } from '@utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);

const LANGS = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'ar', 'hi'] as string[];
const LEVELS = ['beginner', 'intermediate', 'advanced'] as string[];
const GENDERS = ['male', 'female', 'other'] as string[];
const RANKS = ['junior', 'collector', 'senior', 'elite', 'legendary'] as string[];
const MEDAL_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as string[];
const ACHIEVEMENT_TYPES = ['first_message', 'streak_7', 'streak_30', 'medal_collector', 'polyglot', 'top_helper'];
const ITEM_TYPES = ['avatarEffect', 'chatBubble', 'chatBackground'] as string[];
const POST_TYPES = ['text', 'image', 'voice'] as string[];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await dbConnect();
  logger.info('[Seed] Connected to MongoDB');

  // Wipe existing seed data
  await Promise.all([
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    FollowModel.deleteMany({}),
    PostModel.deleteMany({}),
    AchievementModel.deleteMany({}),
    InventoryModel.deleteMany({}),
    StreakModel.deleteMany({}),
  ]);
  logger.info('[Seed] Cleared existing data');

  const passwordHash = await hash('Password123!', 10);

  // ─── Users ──────────────────────────────────────────────────────────────────

  const userDocs = Array.from({ length: 20 }, (_, i) => {
    const nativeLang = pick(LANGS);
    const learningLangs = LANGS.filter(l => l !== nativeLang).slice(0, rand(1, 5));
    const proficiencyLevels: Record<string, string> = {};
    learningLangs.forEach(l => {
      proficiencyLevels[l] = pick(LEVELS);
    });

    const rank = pick(RANKS);
    const rankMedalMap: Record<string, number> = { junior: 0, collector: 3, senior: 10, elite: 25, legendary: 50 };
    const medalCount = rankMedalMap[rank] ?? 0;

    return {
      displayName: `TestUser${i + 1}`,
      email: `testuser${i + 1}@talkapp.dev`,
      passwordHash,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=user${i + 1}`,
      provider: 'local' as const,
      googleId: null,
      role: i === 0 ? ('admin' as const) : ('user' as const),
      isVerified: true,
      isActive: true,

      nativeLang,
      learningLangs,
      proficiencyLevels: new Map(Object.entries(proficiencyLevels)),

      gender: pick(GENDERS),
      dateOfBirth: new Date(1990 + rand(0, 15), rand(0, 11), rand(1, 28)),
      location: {
        type: 'Point' as const,
        coordinates: [parseFloat((rand(-180, 180) + Math.random()).toFixed(6)), parseFloat((rand(-90, 90) + Math.random()).toFixed(6))] as [
          number,
          number,
        ],
      },
      bio: `Hi! I'm TestUser${i + 1}. I love learning languages and making new friends.`,

      daysJoined: rand(1, 365),
      joinedAt: daysAgo(rand(1, 365)),
      currentStreak: rand(0, 60),
      longestStreak: rand(10, 120),
      lastActiveDate: daysAgo(rand(0, 3)),

      followingCount: rand(0, 200),
      followersCount: rand(0, 500),

      totalMedalCount: medalCount,
      collectorRank: rank,
      equippedItems: {
        avatarEffect: rand(0, 1) ? `effect_${rand(1, 10)}` : null,
        chatBubble: rand(0, 1) ? `bubble_${rand(1, 10)}` : null,
        chatBackground: rand(0, 1) ? `bg_${rand(1, 10)}` : null,
      },

      isOnline: rand(0, 1) === 1,
      lastSeen: daysAgo(rand(0, 7)),
    };
  });

  const users = await UserModel.insertMany(userDocs);
  logger.info(`[Seed] Created ${users.length} users`);

  // ─── Streaks ────────────────────────────────────────────────────────────────

  const streakDocs = users.map(u => ({
    userId: u._id,
    currentStreak: u.currentStreak,
    longestStreak: u.longestStreak,
    lastActiveDate: u.lastActiveDate ?? new Date(),
  }));
  await StreakModel.insertMany(streakDocs);
  logger.info(`[Seed] Created ${streakDocs.length} streak records`);

  // ─── Follows ────────────────────────────────────────────────────────────────

  const followPairs = new Set<string>();
  const followDocs: object[] = [];

  for (const user of users) {
    const targets = users.filter(u => !u._id.equals(user._id)).slice(0, rand(2, 6));
    for (const target of targets) {
      const key = `${user._id}-${target._id}`;
      if (followPairs.has(key)) continue;
      followPairs.add(key);
      const reverseKey = `${target._id}-${user._id}`;
      followDocs.push({
        followerId: user._id,
        followingId: target._id,
        isMutual: followPairs.has(reverseKey),
      });
    }
  }
  await FollowModel.insertMany(followDocs);
  logger.info(`[Seed] Created ${followDocs.length} follow records`);

  // ─── Conversations ──────────────────────────────────────────────────────────

  const convPairs = new Set<string>();
  const convDocs: object[] = [];

  for (let i = 0; i < users.length - 1; i++) {
    const a = users[i];
    const b = users[i + 1];
    const key = [a._id.toString(), b._id.toString()].sort().join('-');
    if (convPairs.has(key)) continue;
    convPairs.add(key);
    convDocs.push({
      participantIds: [a._id, b._id],
      lastMessage: {
        text: `Hey! Want to practice ${pick(LANGS)} together?`,
        senderId: a._id,
        timestamp: daysAgo(rand(0, 10)),
      },
      isMutualFriends: rand(0, 1) === 1,
    });
  }
  await ConversationModel.insertMany(convDocs);
  logger.info(`[Seed] Created ${convDocs.length} conversations`);

  // ─── Posts ──────────────────────────────────────────────────────────────────

  const postDocs = users.flatMap(u =>
    Array.from({ length: rand(1, 5) }, () => ({
      userId: u._id,
      content: `Learning ${pick(u.learningLangs.length ? u.learningLangs : [u.nativeLang])} is amazing! Day ${rand(1, 100)} of my journey.`,
      mediaUrl: rand(0, 1) ? `https://picsum.photos/seed/${rand(1, 1000)}/600/400` : null,
      postType: pick(POST_TYPES),
      likeCount: rand(0, 200),
      likedBy: users.slice(0, rand(0, 5)).map(u2 => u2._id),
      createdAt: daysAgo(rand(0, 30)),
    })),
  );
  await PostModel.insertMany(postDocs);
  logger.info(`[Seed] Created ${postDocs.length} posts`);

  // ─── Achievements ────────────────────────────────────────────────────────────

  const achievementDocs: object[] = [];
  for (const user of users) {
    const types = [...ACHIEVEMENT_TYPES].sort(() => Math.random() - 0.5).slice(0, rand(1, 4));
    for (const achievementType of types) {
      achievementDocs.push({
        userId: user._id,
        achievementType,
        medalTier: pick(MEDAL_TIERS),
        earnedAt: daysAgo(rand(1, 180)),
      });
    }
  }
  await AchievementModel.insertMany(achievementDocs);
  logger.info(`[Seed] Created ${achievementDocs.length} achievements`);

  // ─── Inventories ─────────────────────────────────────────────────────────────

  const inventoryDocs = users.map(u => {
    const items = Array.from({ length: rand(0, 8) }, (_, j) => ({
      itemId: `item_${rand(1, 50)}_${j}`,
      itemType: pick(ITEM_TYPES),
      unlockedAt: daysAgo(rand(1, 90)),
    }));
    return {
      userId: u._id,
      items,
      equippedItems: {
        avatarEffectId: u.equippedItems.avatarEffect,
        chatBubbleId: u.equippedItems.chatBubble,
        chatBackgroundId: u.equippedItems.chatBackground,
      },
      collectorRank: u.collectorRank,
      itemCount: items.length,
    };
  });
  await InventoryModel.insertMany(inventoryDocs);
  logger.info(`[Seed] Created ${inventoryDocs.length} inventory records`);

  logger.info('[Seed] ✅ Done');
  await dbDisconnect();
}

seed().catch(err => {
  logger.error('[Seed] Failed:', err);
  void mongoose.disconnect();
  process.exit(1);
});
