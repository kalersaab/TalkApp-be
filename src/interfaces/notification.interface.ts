import type { DevicePlatform } from '@models/deviceToken.model';

export interface NotificationPayload {
  title: string;
  body: string;
  data: Record<string, string>;
  badge?: number;
  sound?: string;
}

export interface DeliveryTarget {
  userId: string;
  platform: DevicePlatform;
  token: string;
}

export interface DeliveryResult {
  userId: string;
  platform: DevicePlatform;
  success: boolean;
  invalidToken: boolean;
  error?: string;
}

export interface SenderProfile {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AchievementInfo {
  achievementType: string;
  medalTier: string;
  name: string;
}

export interface NotificationPreferences {
  messages: boolean;
  follows: boolean;
  achievements: boolean;
  posts: boolean;
}
