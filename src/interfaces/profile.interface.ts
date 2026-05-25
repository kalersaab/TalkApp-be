import type { MedalTier, PostType, CollectorRank } from './users.interface';

// ─── Full profile DTO returned to clients ─────────────────────────────────────

export interface ProfileDTO {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  nativeLang: string;
  learningLangs: string[];
  proficiencyLevels: Record<string, string>;
  gender: string | null;
  joinedAt: Date;
  daysJoined: number;
  // Activity
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date | null;
  // Social
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;       // is the requesting user following this profile?
  // Gamification
  totalMedalCount: number;
  collectorRank: CollectorRank;
  equippedItems: {
    avatarEffect: string | null;
    chatBubble: string | null;
    chatBackground: string | null;
  };
  recentAchievements: AchievementDTO[];
  // Inventory summary
  inventory: InventorySummaryDTO | null;
  // Presence
  isOnline: boolean;
  lastSeen: Date | null;
}

export interface AchievementDTO {
  _id: string;
  achievementType: string;
  medalTier: MedalTier;
  earnedAt: Date;
}

export interface InventorySummaryDTO {
  itemCount: number;
  collectorRank: CollectorRank;
  equippedItems: {
    avatarEffectId: string | null;
    chatBubbleId: string | null;
    chatBackgroundId: string | null;
  };
}

// ─── Post DTO ─────────────────────────────────────────────────────────────────

export interface PostDTO {
  _id: string;
  userId: string;
  content: string;
  mediaUrl: string | null;
  postType: PostType;
  likeCount: number;
  isLikedByMe: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PagedPosts {
  posts: PostDTO[];
  nextCursor: string | null;
}

// ─── Basic user DTO (for follower/following lists) ────────────────────────────

export interface BasicUserDTO {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  nativeLang: string;
  learningLangs: string[];
  isOnline: boolean;
}

export interface PagedUsers {
  users: BasicUserDTO[];
  nextCursor: string | null;
}

// ─── Follow result ────────────────────────────────────────────────────────────

export interface FollowResult {
  following: boolean;
  mutual: boolean;
}
