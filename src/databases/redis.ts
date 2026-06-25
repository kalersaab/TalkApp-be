import Redis, { Cluster } from 'ioredis';

import { REDIS_MODE, REDIS_NODES, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_KEY_PREFIX } from '@config';
import { logger } from '@utils/logger';
import type {
  SocketInfo,
  UserStatus,
  RateLimitResult,
  ProfileData,
  InventoryData,
  StreakData,
  ConvMessagePayload,
  PresencePayload,
} from '@interfaces/redis.interface';
import { RedisError } from '@interfaces/redis.interface';

// ─── Key patterns ─────────────────────────────────────────────────────────────
// All keys are prefixed with REDIS_KEY_PREFIX (default 'talkapp:') to avoid
// collisions when sharing a Redis instance across services.

const NS = (REDIS_KEY_PREFIX ?? 'talkapp:').replace(/:$/, ''); // strip trailing colon

export const KEYS = {
  PROFILE: (userId: string) => `${NS}:profile:${userId}`,
  TRANSLATION: (hash: string) => `${NS}:translation:${hash}`,
  PRESENCE: (userId: string) => `${NS}:presence:${userId}`,
  CONV_CHANNEL: (convId: string) => `${NS}:conv:${convId}`,
  RATE_LIMIT: (userId: string, action: string) => `${NS}:ratelimit:${userId}:${action}`,
  INVENTORY: (userId: string) => `${NS}:inventory:${userId}`,
  STREAK: (userId: string) => `${NS}:streak:${userId}`,
  ONLINE_SET: `${NS}:online_users`,
  REFRESH_TOKEN: (tokenHash: string) => `${NS}:refresh:${tokenHash}`,
} as const;

// ─── TTL constants (seconds) ──────────────────────────────────────────────────

export const TTL = {
  PROFILE: 5 * 60, // 5 minutes
  TRANSLATION: 30 * 24 * 3600, // 30 days
  INVENTORY: 10 * 60, // 10 minutes
  STREAK: 25 * 3600, // 25 hours
  PRESENCE: 30, // 30 seconds — refreshed on heartbeat
  REFRESH_TOKEN: 30 * 24 * 3600, //30 days
} as const;

// ─── Client factory ───────────────────────────────────────────────────────────

type RedisClient = Redis | Cluster;

function buildClusterNodes(): Array<{ host: string; port: number }> {
  return (REDIS_NODES ?? '127.0.0.1:6379').split(',').map(node => {
    const [host, portStr] = node.trim().split(':');
    return { host: host ?? '127.0.0.1', port: parseInt(portStr ?? '6379', 10) };
  });
}

const COMMON_OPTIONS = {
  password: REDIS_PASSWORD || undefined,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number): number | null => {
    if (times > 10) {
      logger.error('[Redis] Max reconnect attempts reached');
      return null; // stop retrying
    }
    const delay = Math.min(500 * 2 ** (times - 1), 30_000);
    logger.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
};

function createClient(purpose: 'data' | 'sub'): RedisClient {
  const isCluster = (REDIS_MODE ?? 'single') === 'cluster';

  if (isCluster) {
    const nodes = buildClusterNodes();
    const client = new Cluster(nodes, {
      redisOptions: {
        ...COMMON_OPTIONS,
        // Subscriber clients must not be used for regular commands —
        // ioredis enforces this automatically for Cluster in subscribe mode.
      },
      scaleReads: purpose === 'data' ? 'slave' : 'master',
      enableOfflineQueue: true,
      clusterRetryStrategy: (times: number) => Math.min(500 * 2 ** (times - 1), 30_000),
    });
    attachListeners(client, `Redis[${purpose}][cluster]`);
    return client;
  }

  const client = new Redis({
    host: REDIS_HOST ?? '127.0.0.1',
    port: parseInt(REDIS_PORT ?? '6379', 10),
    ...COMMON_OPTIONS,
    // Lazy connect — we call .connect() explicitly in redisConnect()
    lazyConnect: true,
  });
  attachListeners(client, `Redis[${purpose}]`);
  return client;
}

function attachListeners(client: RedisClient, label: string): void {
  client.on('connect', () => logger.info(`[${label}] Connecting…`));
  client.on('ready', () => logger.info(`[${label}] Ready`));
  client.on('reconnecting', () => logger.warn(`[${label}] Reconnecting…`));
  client.on('error', err => logger.error(`[${label}] Error: ${(err as Error).message}`));
  client.on('close', () => logger.warn(`[${label}] Connection closed`));
  client.on('end', () => logger.warn(`[${label}] Connection ended`));
}

// ─── RedisService ─────────────────────────────────────────────────────────────

export class RedisService {
  get() {
    throw new Error('Method not implemented.');
  }
  /** General-purpose client: cache, presence, rate limiting, data ops */
  private readonly data: RedisClient;

  /**
   * Dedicated pub/sub client.
   * Once a client issues SUBSCRIBE it can ONLY run subscribe/unsubscribe/ping.
   * Keeping it separate means the data client stays fully usable.
   */
  private readonly sub: RedisClient;

  constructor() {
    this.data = createClient('data');
    this.sub = createClient('sub');
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // Cluster clients connect automatically; single-node needs explicit connect
    if (this.data instanceof Redis) await this.data.connect();
    if (this.sub instanceof Redis) await this.sub.connect();
    logger.info('[Redis] Both clients connected');
  }

  async disconnect(): Promise<void> {
    await this.data.quit();
    await this.sub.quit();
    logger.info('[Redis] Disconnected');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUB/SUB
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Publish a chat message to a conversation channel.
   * All WS nodes subscribed to this channel will receive it.
   */
  async publishMessage(convId: string, payload: ConvMessagePayload): Promise<void> {
    try {
      await this.data.publish(KEYS.CONV_CHANNEL(convId), JSON.stringify(payload));
    } catch (err) {
      throw new RedisError('publishMessage', err);
    }
  }

  /**
   * Subscribe this WS node to a conversation channel.
   * `callback` is invoked for every message received on the channel.
   */
  async subscribeToConversation(convId: string, callback: (payload: ConvMessagePayload) => void): Promise<void> {
    const channel = KEYS.CONV_CHANNEL(convId);
    try {
      await this.sub.subscribe(channel);
      this.sub.on('message', (ch: string, raw: string) => {
        if (ch !== channel) return;
        try {
          callback(JSON.parse(raw) as ConvMessagePayload);
        } catch {
          logger.warn(`[Redis] Malformed message on ${ch}`);
        }
      });
    } catch (err) {
      throw new RedisError('subscribeToConversation', err);
    }
  }

  /** Unsubscribe from a conversation channel when the last participant leaves. */
  async unsubscribeFromConversation(convId: string): Promise<void> {
    try {
      await this.sub.unsubscribe(KEYS.CONV_CHANNEL(convId));
    } catch (err) {
      throw new RedisError('unsubscribeFromConversation', err);
    }
  }

  /** Publish a presence change (online/offline) to the presence channel. */
  async publishPresence(userId: string, status: UserStatus): Promise<void> {
    const payload: PresencePayload = {
      userId,
      status,
      timestamp: new Date().toISOString(),
    };
    try {
      await this.data.publish(`${NS}:presence_events`, JSON.stringify(payload));
    } catch (err) {
      throw new RedisError('publishPresence', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CACHE
  // ══════════════════════════════════════════════════════════════════════════

  async cacheProfile(userId: string, profileData: ProfileData, ttlSeconds = TTL.PROFILE): Promise<void> {
    try {
      await this.data.set(KEYS.PROFILE(userId), JSON.stringify(profileData), 'EX', ttlSeconds);
    } catch (err) {
      throw new RedisError('cacheProfile', err);
    }
  }

  async getProfile(userId: string): Promise<ProfileData | null> {
    try {
      const raw = await this.data.get(KEYS.PROFILE(userId));
      return raw ? (JSON.parse(raw) as ProfileData) : null;
    } catch (err) {
      throw new RedisError('getProfile', err);
    }
  }

  async invalidateProfile(userId: string): Promise<void> {
    try {
      await this.data.del(KEYS.PROFILE(userId));
    } catch (err) {
      throw new RedisError('invalidateProfile', err);
    }
  }

  async cacheTranslation(hash: string, translation: string, ttlSeconds = TTL.TRANSLATION): Promise<void> {
    try {
      await this.data.set(KEYS.TRANSLATION(hash), translation, 'EX', ttlSeconds);
    } catch (err) {
      throw new RedisError('cacheTranslation', err);
    }
  }

  async getTranslation(hash: string): Promise<string | null> {
    try {
      return await this.data.get(KEYS.TRANSLATION(hash));
    } catch (err) {
      throw new RedisError('getTranslation', err);
    }
  }

  async cacheInventory(userId: string, inventoryData: InventoryData, ttlSeconds = TTL.INVENTORY): Promise<void> {
    try {
      await this.data.set(KEYS.INVENTORY(userId), JSON.stringify(inventoryData), 'EX', ttlSeconds);
    } catch (err) {
      throw new RedisError('cacheInventory', err);
    }
  }

  async getInventory(userId: string): Promise<InventoryData | null> {
    try {
      const raw = await this.data.get(KEYS.INVENTORY(userId));
      return raw ? (JSON.parse(raw) as InventoryData) : null;
    } catch (err) {
      throw new RedisError('getInventory', err);
    }
  }

  async invalidateInventory(userId: string): Promise<void> {
    try {
      await this.data.del(KEYS.INVENTORY(userId));
    } catch (err) {
      throw new RedisError('invalidateInventory', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRESENCE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Mark a user online. Stores wsNodeId + socketId as a Redis hash with a
   * 30-second TTL. The TTL is refreshed on every heartbeat via refreshPresence().
   * If the process crashes, the key expires automatically — no stale presence.
   */
  async setUserOnline(userId: string, wsNodeId: string, socketId: string): Promise<void> {
    const key = KEYS.PRESENCE(userId);
    try {
      const pipeline = this.data.pipeline();
      pipeline.hset(key, { wsNodeId, socketId });
      pipeline.expire(key, TTL.PRESENCE);
      pipeline.sadd(KEYS.ONLINE_SET, userId);
      await pipeline.exec();
      await this.publishPresence(userId, 'online');
    } catch (err) {
      throw new RedisError('setUserOnline', err);
    }
  }

  async setUserOffline(userId: string): Promise<void> {
    try {
      const pipeline = this.data.pipeline();
      pipeline.del(KEYS.PRESENCE(userId));
      pipeline.srem(KEYS.ONLINE_SET, userId);
      await pipeline.exec();
      await this.publishPresence(userId, 'offline');
    } catch (err) {
      throw new RedisError('setUserOffline', err);
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      return (await this.data.exists(KEYS.PRESENCE(userId))) === 1;
    } catch (err) {
      throw new RedisError('isUserOnline', err);
    }
  }

  async getUserSocketInfo(userId: string): Promise<SocketInfo | null> {
    try {
      const result = await this.data.hgetall(KEYS.PRESENCE(userId));
      if (!result || !result['wsNodeId']) return null;
      return { wsNodeId: result['wsNodeId'], socketId: result['socketId'] ?? '' };
    } catch (err) {
      throw new RedisError('getUserSocketInfo', err);
    }
  }

  /** Reset the 30-second TTL — call this on every WS heartbeat. */
  async refreshPresence(userId: string): Promise<void> {
    try {
      await this.data.expire(KEYS.PRESENCE(userId), TTL.PRESENCE);
    } catch (err) {
      throw new RedisError('refreshPresence', err);
    }
  }

  /** Returns the count of users currently in the online set. */
  async getOnlineCount(): Promise<number> {
    try {
      return await this.data.scard(KEYS.ONLINE_SET);
    } catch (err) {
      throw new RedisError('getOnlineCount', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STREAK CACHE
  // ══════════════════════════════════════════════════════════════════════════

  async getStreak(userId: string): Promise<StreakData | null> {
    try {
      const raw = await this.data.get(KEYS.STREAK(userId));
      return raw ? (JSON.parse(raw) as StreakData) : null;
    } catch (err) {
      throw new RedisError('getStreak', err);
    }
  }

  async setStreak(userId: string, streakData: StreakData, ttlSeconds = TTL.STREAK): Promise<void> {
    try {
      await this.data.set(KEYS.STREAK(userId), JSON.stringify(streakData), 'EX', ttlSeconds);
    } catch (err) {
      throw new RedisError('setStreak', err);
    }
  }

  async invalidateStreak(userId: string): Promise<void> {
    try {
      await this.data.del(KEYS.STREAK(userId));
    } catch (err) {
      throw new RedisError('invalidateStreak', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HYBRID AUTHENTICATION SESSIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Save an active refresh token session state hash to memory.
   *
   */

  async setRefreshTokenSession(
    tokenHash: string,
    sessionData: { userId: string; used: boolean; family: string; isCompromised?: boolean },
    ttlSeconds = TTL.REFRESH_TOKEN,
  ): Promise<void> {
    try {
      await this.data.set(KEYS.REFRESH_TOKEN(tokenHash), JSON.stringify(sessionData), 'EX', ttlSeconds);
    } catch (err) {
      throw new RedisError('setRefreshTokenSession', err);
    }
  }

  /**
   * Look up a refresh token session state details by its signature hash.
   * Uses Lua script to atomically retrieve and delete the token in one operation.
   * This prevents reuse of the same refresh token across multiple requests.
   */
  async consumeRefreshTokenSession(tokenHash: string): Promise<{ userId: string; family: string; used: boolean; isCompromised?: boolean } | null> {
    try {
      const key = KEYS.REFRESH_TOKEN(tokenHash);
      // Lua script: GET then DEL atomically
      const raw = (await this.data.eval(
        `
          local value = redis.call('GET', KEYS[1])
          if value then
            redis.call('DEL', KEYS[1])
          end
          return value
        `,
        1,
        key,
      )) as string | null;

      return raw ? (JSON.parse(raw) as { userId: string; family: string; used: boolean; isCompromised?: boolean }) : null;
    } catch (err) {
      throw new RedisError('consumeRefreshTokenSession', err);
    }
  }

  /**
   * Evict/Revoke a refresh token immediately (Logout or compromise enforcement).
   */
  async invalidateRefreshTokenSession(tokenHash: string): Promise<void> {
    try {
      await this.data.del(KEYS.REFRESH_TOKEN(tokenHash));
    } catch (err) {
      throw new RedisError('invalidateRefreshTokenSession', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING  — sliding window via sorted set
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sliding-window rate limiter using a Redis sorted set.
   *
   * Each request is stored as a member with score = timestamp (ms).
   * On every call we:
   *   1. Remove members older than the window
   *   2. Count remaining members
   *   3. If count < limit → add this request and allow
   *   4. Otherwise → deny
   *
   * This is O(log N) per call and gives a true sliding window,
   * unlike the fixed-window INCR approach which allows 2× burst at boundaries.
   *
   * Usage examples:
   *   checkRateLimit(`${userId}:message`,     60,  60)   // 60 msgs/min
   *   checkRateLimit(`${userId}:translation`, 200, 60)   // 200 translations/min
   *   checkRateLimit(`${userId}:follow`,      30,  60)   // 30 follows/min
   */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = KEYS.RATE_LIMIT(key, 'window');
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const resetAt = now + windowSeconds * 1000;

    try {
      const pipeline = this.data.pipeline();
      // 1. Remove expired entries
      pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
      // 2. Count current entries
      pipeline.zcard(redisKey);
      // 3. Add this request (score = timestamp, member = unique id)
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
      // 4. Set TTL so the key self-cleans
      pipeline.expire(redisKey, windowSeconds + 1);

      const results = await pipeline.exec();

      // zcard result is at index 1
      const currentCount = (results?.[1]?.[1] as number) ?? 0;

      if (currentCount >= limit) {
        // Undo the zadd — we're not allowing this request
        await this.data.zpopmax(redisKey);
        return { allowed: false, remaining: 0, resetAt };
      }

      return {
        allowed: true,
        remaining: limit - currentCount - 1,
        resetAt,
      };
    } catch (err) {
      throw new RedisError('checkRateLimit', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ══════════════════════════════════════════════════════════════════════════

  async healthCheck(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.data.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', latencyMs: Date.now() - start };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSORS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get the general-purpose data client for direct Redis operations
   */
  getDataClient(): RedisClient {
    return this.data;
  }

  /**
   * Get the pub/sub client for subscriptions
   */
  getSubClient(): RedisClient {
    return this.sub;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance: RedisService | null = null;

export function getRedisService(): RedisService {
  if (!instance) instance = new RedisService();
  return instance;
}

export async function redisConnect(): Promise<void> {
  await getRedisService().connect();
}

export async function redisDisconnect(): Promise<void> {
  await getRedisService().disconnect();
  instance = null;
}
