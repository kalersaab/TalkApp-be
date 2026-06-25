import type { Document, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Provider = 'local' | 'google' | 'facebook' | 'phone';
export type Role = 'user' | 'admin';
export type Gender = 'male' | 'female' | 'other';
export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced';
export type CollectorRank = 'junior' | 'collector' | 'senior' | 'elite' | 'legendary';
export type MedalTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type PostType = 'text' | 'image' | 'voice';
export type ItemType = 'avatarEffect' | 'chatBubble' | 'chatBackground';

// ─── Sub-documents ────────────────────────────────────────────────────────────

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface EquippedItems {
  avatarEffect: string | null;
  chatBubble: string | null;
  chatBackground: string | null;
}

export interface LastMessage {
  text: string;
  senderId: Types.ObjectId;
  timestamp: Date;
}

export interface InventoryItem {
  itemId: string;
  itemType: ItemType;
  unlockedAt: Date;
}

export interface EquippedInventoryItems {
  avatarEffectId: string | null;
  chatBubbleId: string | null;
  chatBackgroundId: string | null;
}

// ─── Document Interfaces ──────────────────────────────────────────────────────

export interface IUser extends Document {
  displayName: string;
  username: string;
  email: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  provider: Provider;
  googleId: string | null;
  appleId: string | null;
  facebookId: string | null;
  role: Role;
  isVerified: boolean;
  isActive: boolean;

  // Language learning
  nativeLang: string;
  learningLangs: string[];
  proficiencyLevels: Map<string, ProficiencyLevel>;

  // Profile
  gender: Gender | null;
  dateOfBirth: Date | null;
  location: GeoPoint | null;
  bio: string | null;

  // Activity
  daysJoined: number;
  joinedAt: Date;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date | null;

  // Social
  followingCount: number;
  followersCount: number;

  // Gamification
  totalMedalCount: number;
  collectorRank: CollectorRank;
  equippedItems: EquippedItems;

  // Presence
  isOnline: boolean;
  lastSeen: Date | null;

  // Brute-force protection
  failedLoginAttempts: number;
  lockUntil: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface IConversation extends Document {
  participantIds: Types.ObjectId[];
  lastMessage: LastMessage | null;
  isMutualFriends: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFollow extends Document {
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  isMutual: boolean;
  createdAt: Date;
}

export interface IPost extends Document {
  userId: Types.ObjectId;
  content: string;
  mediaUrl: string | null;
  postType: PostType;
  likeCount: number;
  likedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAchievement extends Document {
  userId: Types.ObjectId;
  achievementType: string;
  medalTier: MedalTier;
  earnedAt: Date;
}

export interface IInventory extends Document {
  userId: Types.ObjectId;
  items: InventoryItem[];
  equippedItems: EquippedInventoryItems;
  collectorRank: CollectorRank;
  itemCount: number;
  updatedAt: Date;
}

export interface IStreak extends Document {
  userId: Types.ObjectId;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date;
  updatedAt: Date;
}

// ─── Legacy compat (used by existing auth service) ────────────────────────────

export interface LoginUser {
  email: string;
  password: string;
}

export interface IRedisSession {
  userId: string;
  family: string;
  used: boolean;
}
