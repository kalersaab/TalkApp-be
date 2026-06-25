import { Types } from 'mongoose';

import { UserModel } from '@models/users.model';
import { FollowModel } from '@models/follow.model';
import { PostModel } from '@models/post.model';
import { AchievementModel } from '@models/achievement.model';
import { InventoryModel } from '@models/inventory.model';
import { getRedisService } from '@databases/redis';
import { uploadToS3 } from '@utils/s3';
import { HttpException } from '@exceptions/HttpException';
import type {
  ProfileDTO,
  AchievementDTO,
  InventorySummaryDTO,
  PostDTO,
  PagedPosts,
  BasicUserDTO,
  PagedUsers,
  FollowResult,
} from '@interfaces/profile.interface';
import type { IUser, IAchievement, IInventory, IPost, IFollow } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

// ─── Cache TTL ────────────────────────────────────────────────────────────────

const PROFILE_TTL = 5 * 60; // 5 minutes
const profileCacheKey = (userId: string) => `profile:full:${userId}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toAchievementDTO(a: IAchievement): AchievementDTO {
  return {
    _id: a._id.toString(),
    achievementType: a.achievementType,
    medalTier: a.medalTier,
    earnedAt: a.earnedAt,
  };
}

function toInventorySummary(inv: IInventory): InventorySummaryDTO {
  return {
    itemCount: inv.itemCount,
    collectorRank: inv.collectorRank,
    equippedItems: {
      avatarEffectId: inv.equippedItems.avatarEffectId,
      chatBubbleId: inv.equippedItems.chatBubbleId,
      chatBackgroundId: inv.equippedItems.chatBackgroundId,
    },
  };
}

function toPostDTO(post: IPost, requesterId: string): PostDTO {
  return {
    _id: post._id.toString(),
    userId: post.userId.toString(),
    content: post.content,
    mediaUrl: post.mediaUrl,
    postType: post.postType,
    likeCount: post.likeCount,
    isLikedByMe: post.likedBy.some(id => id.toString() === requesterId),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function toBasicUserDTO(user: IUser): BasicUserDTO {
  return {
    _id: user._id.toString(),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    nativeLang: user.nativeLang,
    learningLangs: user.learningLangs,
    isOnline: user.isOnline,
  };
}

// ─── ProfileService ───────────────────────────────────────────────────────────

export class ProfileService {
  // ── getProfile ───────────────────────────────────────────────────────────────

  async getProfile(targetUserId: string, requesterId: string): Promise<ProfileDTO> {
    // Try Redis cache first
    const redis = getRedisService();
    const cacheKey = profileCacheKey(targetUserId);

    try {
      const cached = await redis.getProfile(cacheKey);
      if (cached) {
        // Inject live isFollowing — this is requester-specific so we don't cache it
        const dto = cached as unknown as ProfileDTO;
        dto.isFollowing = await this.isFollowing(requesterId, targetUserId);
        return dto;
      }
    } catch {
      // Cache miss — continue to DB
    }

    const user = await UserModel.findById(targetUserId).lean<IUser>();
    if (!user) throw new HttpException(404, 'User not found');

    // Parallel fetch of related data
    const [achievements, inventory, isFollowing] = await Promise.all([
      AchievementModel.find({ userId: new Types.ObjectId(targetUserId) })
        .sort({ earnedAt: -1 })
        .limit(5)
        .lean<IAchievement[]>(),
      InventoryModel.findOne({ userId: new Types.ObjectId(targetUserId) }).lean<IInventory>(),
      this.isFollowing(requesterId, targetUserId),
    ]);

    const dto: ProfileDTO = {
      _id: user._id.toString(),
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      nativeLang: user.nativeLang,
      learningLangs: user.learningLangs,
      proficiencyLevels: user.proficiencyLevels ? Object.fromEntries(user.proficiencyLevels.entries()) : {},
      gender: user.gender,
      joinedAt: user.joinedAt,
      daysJoined: user.daysJoined,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lastActiveDate: user.lastActiveDate,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      isFollowing,
      totalMedalCount: user.totalMedalCount,
      collectorRank: user.collectorRank,
      equippedItems: {
        avatarEffect: user.equippedItems?.avatarEffect ?? null,
        chatBubble: user.equippedItems?.chatBubble ?? null,
        chatBackground: user.equippedItems?.chatBackground ?? null,
      },
      recentAchievements: achievements.map(toAchievementDTO),
      inventory: inventory ? toInventorySummary(inventory) : null,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    };

    // Cache without isFollowing (requester-specific)
    const cacheable = { ...dto, isFollowing: false };
    redis.cacheProfile(cacheKey, cacheable as unknown as Record<string, unknown>, PROFILE_TTL).catch(() => null);

    dto.isFollowing = isFollowing;
    return dto;
  }

  // ── updateProfile ────────────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      nativeLang?: string;
      learningLangs?: string[];
      proficiencyLevels?: Record<string, string>;
      gender?: string;
      dateOfBirth?: Date;
    },
  ): Promise<ProfileDTO> {
    const allowedFields: Record<string, unknown> = {};

    if (updates.displayName !== undefined) allowedFields['displayName'] = updates.displayName;
    if (updates.bio !== undefined) allowedFields['bio'] = updates.bio;
    if (updates.nativeLang !== undefined) allowedFields['nativeLang'] = updates.nativeLang;
    if (updates.gender !== undefined) allowedFields['gender'] = updates.gender;
    if (updates.dateOfBirth !== undefined) allowedFields['dateOfBirth'] = updates.dateOfBirth;

    if (updates.learningLangs !== undefined) {
      if (updates.learningLangs.length > 5) {
        throw new HttpException(400, 'Maximum 5 learning languages allowed');
      }
      allowedFields['learningLangs'] = updates.learningLangs;
    }

    if (updates.proficiencyLevels !== undefined) {
      allowedFields['proficiencyLevels'] = new Map(Object.entries(updates.proficiencyLevels));
    }

    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: allowedFields });

    // Bust cache
    await getRedisService()
      .invalidateProfile(profileCacheKey(userId))
      .catch(() => null);

    return this.getProfile(userId, userId);
  }

  // ── uploadAvatar ─────────────────────────────────────────────────────────────

  async uploadAvatar(userId: string, fileBuffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const key = `avatars/${userId}/${Date.now()}.${ext}`;

    const url = await uploadToS3(key, fileBuffer, mimeType);

    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { avatarUrl: url } });
    await getRedisService()
      .invalidateProfile(profileCacheKey(userId))
      .catch(() => null);

    logger.info(`[ProfileService] avatar updated for ${userId}`);
    return url;
  }

  // ── getProfilePosts ──────────────────────────────────────────────────────────

  async getProfilePosts(targetUserId: string, requesterId: string, limit = 20, lastPostId?: string): Promise<PagedPosts> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(targetUserId),
    };
    if (lastPostId) {
      query['_id'] = { $lt: new Types.ObjectId(lastPostId) };
    }

    const posts = await PostModel.find(query).sort({ createdAt: -1 }).limit(limit).lean<IPost[]>();

    return {
      posts: posts.map(p => toPostDTO(p, requesterId)),
      nextCursor: posts.length === limit ? posts[posts.length - 1]._id.toString() : null,
    };
  }

  // ── getFollowers ─────────────────────────────────────────────────────────────

  async getFollowers(targetUserId: string, limit = 20, lastUserId?: string): Promise<PagedUsers> {
    const query: Record<string, unknown> = {
      followingId: new Types.ObjectId(targetUserId),
    };
    if (lastUserId) {
      query['followerId'] = { $lt: new Types.ObjectId(lastUserId) };
    }

    const follows = await FollowModel.find(query).sort({ createdAt: -1 }).limit(limit).lean<IFollow[]>();

    const followerIds = follows.map(f => f.followerId);
    const users = await UserModel.find({ _id: { $in: followerIds } })
      .select('displayName avatarUrl nativeLang learningLangs isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const ordered = followerIds.map(id => userMap.get(id.toString())).filter((u): u is IUser => u !== undefined);

    return {
      users: ordered.map(toBasicUserDTO),
      nextCursor: follows.length === limit ? follows[follows.length - 1].followerId.toString() : null,
    };
  }

  // ── getFollowing ─────────────────────────────────────────────────────────────

  async getFollowing(targetUserId: string, limit = 20, lastUserId?: string): Promise<PagedUsers> {
    const query: Record<string, unknown> = {
      followerId: new Types.ObjectId(targetUserId),
    };
    if (lastUserId) {
      query['followingId'] = { $lt: new Types.ObjectId(lastUserId) };
    }

    const follows = await FollowModel.find(query).sort({ createdAt: -1 }).limit(limit).lean<IFollow[]>();

    const followingIds = follows.map(f => f.followingId);
    const users = await UserModel.find({ _id: { $in: followingIds } })
      .select('displayName avatarUrl nativeLang learningLangs isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const ordered = followingIds.map(id => userMap.get(id.toString())).filter((u): u is IUser => u !== undefined);

    return {
      users: ordered.map(toBasicUserDTO),
      nextCursor: follows.length === limit ? follows[follows.length - 1].followingId.toString() : null,
    };
  }

  // ── getAchievements ──────────────────────────────────────────────────────────

  async getAchievements(
    targetUserId: string,
    limit = 20,
    lastAchievementId?: string,
  ): Promise<{ achievements: AchievementDTO[]; nextCursor: string | null }> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(targetUserId),
    };
    if (lastAchievementId) {
      query['_id'] = { $lt: new Types.ObjectId(lastAchievementId) };
    }

    const achievements = await AchievementModel.find(query).sort({ earnedAt: -1 }).limit(limit).lean<IAchievement[]>();

    return {
      achievements: achievements.map(toAchievementDTO),
      nextCursor: achievements.length === limit ? achievements[achievements.length - 1]._id.toString() : null,
    };
  }

  // ── follow ────────────────────────────────────────────────────────────────────

  async follow(followerId: string, followingId: string): Promise<FollowResult> {
    if (followerId === followingId) {
      throw new HttpException(400, 'Cannot follow yourself');
    }

    const target = await UserModel.findById(followingId).lean();
    if (!target) throw new HttpException(404, 'User not found');

    // Check if reverse follow exists (they follow us)
    const reverseExists = await FollowModel.exists({
      followerId: new Types.ObjectId(followingId),
      followingId: new Types.ObjectId(followerId),
    });

    const isMutual = !!reverseExists;

    // Upsert the follow record
    await FollowModel.findOneAndUpdate(
      {
        followerId: new Types.ObjectId(followerId),
        followingId: new Types.ObjectId(followingId),
      },
      { $set: { isMutual } },
      { upsert: true },
    );

    // If mutual, update the reverse record too
    if (isMutual) {
      await FollowModel.updateOne(
        {
          followerId: new Types.ObjectId(followingId),
          followingId: new Types.ObjectId(followerId),
        },
        { $set: { isMutual: true } },
      );
    }

    // Update denormalised counts atomically
    await Promise.all([
      UserModel.updateOne({ _id: new Types.ObjectId(followerId) }, { $inc: { followingCount: 1 } }),
      UserModel.updateOne({ _id: new Types.ObjectId(followingId) }, { $inc: { followersCount: 1 } }),
    ]);

    // Bust both profile caches
    const redis = getRedisService();
    await Promise.all([
      redis.invalidateProfile(profileCacheKey(followerId)).catch(() => null),
      redis.invalidateProfile(profileCacheKey(followingId)).catch(() => null),
    ]);

    return { following: true, mutual: isMutual };
  }

  // ── unfollow ──────────────────────────────────────────────────────────────────

  async unfollow(followerId: string, followingId: string): Promise<FollowResult> {
    if (followerId === followingId) {
      throw new HttpException(400, 'Cannot unfollow yourself');
    }

    const deleted = await FollowModel.findOneAndDelete({
      followerId: new Types.ObjectId(followerId),
      followingId: new Types.ObjectId(followingId),
    });

    if (!deleted) return { following: false, mutual: false };

    // Clear mutual flag on reverse record
    await FollowModel.updateOne(
      {
        followerId: new Types.ObjectId(followingId),
        followingId: new Types.ObjectId(followerId),
      },
      { $set: { isMutual: false } },
    );

    // Update denormalised counts
    await Promise.all([
      UserModel.updateOne({ _id: new Types.ObjectId(followerId) }, { $inc: { followingCount: -1 } }),
      UserModel.updateOne({ _id: new Types.ObjectId(followingId) }, { $inc: { followersCount: -1 } }),
    ]);

    const redis = getRedisService();
    await Promise.all([
      redis.invalidateProfile(profileCacheKey(followerId)).catch(() => null),
      redis.invalidateProfile(profileCacheKey(followingId)).catch(() => null),
    ]);

    return { following: false, mutual: false };
  }

  // ── likePost / unlikePost ─────────────────────────────────────────────────────

  async likePost(userId: string, postId: string): Promise<{ likeCount: number }> {
    const post = await PostModel.findByIdAndUpdate(
      postId,
      { $addToSet: { likedBy: new Types.ObjectId(userId) }, $inc: { likeCount: 1 } },
      { new: true },
    ).lean<IPost>();

    if (!post) throw new HttpException(404, 'Post not found');
    return { likeCount: post.likeCount };
  }

  async unlikePost(userId: string, postId: string): Promise<{ likeCount: number }> {
    const post = await PostModel.findByIdAndUpdate(
      postId,
      { $pull: { likedBy: new Types.ObjectId(userId) }, $inc: { likeCount: -1 } },
      { new: true },
    ).lean<IPost>();

    if (!post) throw new HttpException(404, 'Post not found');
    return { likeCount: Math.max(0, post.likeCount) };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    if (followerId === followingId) return false;
    const exists = await FollowModel.exists({
      followerId: new Types.ObjectId(followerId),
      followingId: new Types.ObjectId(followingId),
    });
    return !!exists;
  }
}
