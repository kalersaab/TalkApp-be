import type { DevicePlatform } from '@models/deviceToken.model';

// ─── Notification payload ─────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  data: Record<string, string>;
  badge?: number;
  sound?: string;
}

// ─── Delivery target ──────────────────────────────────────────────────────────

export interface DeliveryTarget {
  userId: string;
  platform: DevicePlatform;
  token: string;
}

// ─── Delivery result ──────────────────────────────────────────────────────────

export interface DeliveryResult {
  userId: string;
  platform: DevicePlatform;
  success: boolean;
  invalidToken: boolean;
  error?: string;
}

// ─── Sender profile (minimal — passed in by callers) ─────────────────────────

export interface SenderProfile {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
}

// ─── Achievement info ─────────────────────────────────────────────────────────

export interface AchievementInfo {
  achievementType: string;
  medalTier: string;
  name: string; // human-readable label
}

// ─── Notification preferences ─────────────────────────────────────────────────

export interface NotificationPreferences {
  messages: boolean;
  follows: boolean;
  achievements: boolean;
  posts: boolean;
}
