// ─── Presence ─────────────────────────────────────────────────────────────────

export interface SocketInfo {
  wsNodeId: string; // identifies which server process owns the socket
  socketId: string; // the individual socket/connection id
}

export type UserStatus = 'online' | 'offline';

// ─── Rate limit result ────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (ms) when the window resets
}

// ─── Cache payloads — kept generic so callers own the shape ──────────────────

export type ProfileData = Record<string, unknown>;
export type InventoryData = Record<string, unknown>;

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // ISO string — safe to serialise
}

// ─── Pub/Sub message envelopes ────────────────────────────────────────────────

export interface ConvMessagePayload {
  msgId: string;
  convId: string;
  senderId: string;
  content: string;
  contentType: string;
  createdAt: string;
  [key: string]: unknown; // allow extra fields without breaking the type
}

export interface PresencePayload {
  userId: string;
  status: UserStatus;
  timestamp: string;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export class RedisError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Redis ${operation} failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'RedisError';
  }
}
