export interface SocketInfo {
  wsNodeId: string;
  socketId: string;
}

export type UserStatus = 'online' | 'offline';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export type ProfileData = Record<string, unknown>;
export type InventoryData = Record<string, unknown>;

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}

export interface ConvMessagePayload {
  msgId: string;
  convId: string;
  senderId: string;
  content: string;
  contentType: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface PresencePayload {
  userId: string;
  status: UserStatus;
  timestamp: string;
}

export class RedisError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Redis ${operation} failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'RedisError';
  }
}
