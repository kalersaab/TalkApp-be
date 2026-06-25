import { Client, types, policies, auth, type Host } from 'cassandra-driver';
import type { QueryOptions } from 'cassandra-driver';

import { CASSANDRA_CONTACT_POINTS, CASSANDRA_LOCAL_DC, CASSANDRA_USER, CASSANDRA_PASSWORD } from '@config';
import { logger } from '@utils/logger';
import { CassandraError } from '@interfaces/message.interface';

// ─── CQL statements ───────────────────────────────────────────────────────────

export const CQL = {
  CREATE_KEYSPACE: `
    CREATE KEYSPACE IF NOT EXISTS langlearn
    WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    AND durable_writes = true
  `,

  CREATE_MESSAGES_TABLE: `
    CREATE TABLE IF NOT EXISTS langlearn.messages (
      conv_id      UUID,
      msg_id       TIMEUUID,
      sender_id    UUID,
      content      TEXT,
      content_type TEXT,
      media_url    TEXT,
      status       TEXT,
      translations MAP<TEXT, TEXT>,
      is_encrypted BOOLEAN,
      created_at   TIMESTAMP,
      PRIMARY KEY (conv_id, msg_id)
    ) WITH CLUSTERING ORDER BY (msg_id DESC)
      AND default_time_to_live = 7776000
  `,

  CREATE_OFFLINE_QUEUE_TABLE: `
    CREATE TABLE IF NOT EXISTS langlearn.offline_queue (
      user_id    UUID,
      msg_id     TIMEUUID,
      conv_id    UUID,
      payload    TEXT,
      created_at TIMESTAMP,
      PRIMARY KEY (user_id, msg_id)
    ) WITH CLUSTERING ORDER BY (msg_id ASC)
      AND default_time_to_live = 604800
  `,

  INSERT_MESSAGE: `
    INSERT INTO langlearn.messages
      (conv_id, msg_id, sender_id, content, content_type,
       media_url, status, translations, is_encrypted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  SELECT_MESSAGES: `
    SELECT * FROM langlearn.messages
    WHERE conv_id = ?
    LIMIT ?
  `,

  SELECT_MESSAGES_BEFORE: `
    SELECT * FROM langlearn.messages
    WHERE conv_id = ?
      AND msg_id < ?
    LIMIT ?
  `,

  SELECT_MESSAGE_BY_ID: `
    SELECT * FROM langlearn.messages
    WHERE conv_id = ? AND msg_id = ?
  `,

  UPDATE_STATUS: `
    UPDATE langlearn.messages
    SET status = ?
    WHERE conv_id = ? AND msg_id = ?
  `,

  UPDATE_TRANSLATION: `
    UPDATE langlearn.messages
    SET translations = translations + ?
    WHERE conv_id = ? AND msg_id = ?
  `,

  INSERT_OFFLINE: `
    INSERT INTO langlearn.offline_queue
      (user_id, msg_id, conv_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,

  SELECT_OFFLINE: `
    SELECT * FROM langlearn.offline_queue
    WHERE user_id = ?
  `,

  DELETE_OFFLINE: `
    DELETE FROM langlearn.offline_queue
    WHERE user_id = ? AND msg_id = ?
  `,
} as const;

// ─── CassandraClient ──────────────────────────────────────────────────────────

export class CassandraClient {
  private client: Client;
  private isReady = false;

  private static readonly MAX_RETRIES = 8;
  private static readonly BASE_DELAY_MS = 500;

  // Default query options — prepare:true tells the driver to cache the
  // prepared statement internally on first execution (no manual prepare() needed)
  private static readonly DEFAULT_OPTIONS: QueryOptions = {
    consistency: types.consistencies.localOne,
    prepare: true,
  };

  constructor() {
    const contactPoints = CASSANDRA_CONTACT_POINTS.split(',').map(h => h.trim());

    const localDc = CASSANDRA_LOCAL_DC ?? 'datacenter1';

    const authProvider = CASSANDRA_USER && CASSANDRA_PASSWORD ? new auth.PlainTextAuthProvider(CASSANDRA_USER, CASSANDRA_PASSWORD) : undefined;

    this.client = new Client({
      contactPoints,
      localDataCenter: localDc,

      policies: {
        loadBalancing: new policies.loadBalancing.TokenAwarePolicy(new policies.loadBalancing.DCAwareRoundRobinPolicy(localDc)),
        retry: new policies.retry.RetryPolicy(),
        reconnection: new policies.reconnection.ExponentialReconnectionPolicy(CassandraClient.BASE_DELAY_MS, 60_000),
      },

      pooling: {
        coreConnectionsPerHost: {
          [types.distance.local]: 2,
          [types.distance.remote]: 1,
        },
        maxRequestsPerConnection: 2048,
        heartBeatInterval: 30_000,
      },

      socketOptions: {
        connectTimeout: 10_000,
        readTimeout: 30_000,
      },

      queryOptions: CassandraClient.DEFAULT_OPTIONS,

      ...(authProvider ? { authProvider } : {}),
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    await this.connectWithRetry();
    await this.initSchema();
    this.isReady = true;
    logger.info('[Cassandra] Ready');
  }

  async disconnect(): Promise<void> {
    await this.client.shutdown();
    this.isReady = false;
    logger.info('[Cassandra] Disconnected');
  }

  // ─── Schema init ────────────────────────────────────────────────────────────

  private async initSchema(): Promise<void> {
    // DDL runs without prepare:true — Cassandra cannot prepare DDL statements
    const ddlOptions: QueryOptions = { prepare: false };
    await this.client.execute(CQL.CREATE_KEYSPACE, [], ddlOptions);
    await this.client.execute(CQL.CREATE_MESSAGES_TABLE, [], ddlOptions);
    await this.client.execute(CQL.CREATE_OFFLINE_QUEUE_TABLE, [], ddlOptions);
    logger.info('[Cassandra] Schema initialised');
  }

  // ─── Query execution ─────────────────────────────────────────────────────────

  /**
   * Execute a CQL string with parameters.
   * The driver automatically prepares and caches the statement on first call
   * when prepare:true is set (the default). Subsequent calls reuse the cache.
   */
  async execute(cql: string, params: unknown[] = [], options: QueryOptions = {}): Promise<types.ResultSet> {
    return this.client.execute(cql, params, {
      ...CassandraClient.DEFAULT_OPTIONS,
      ...options,
    });
  }

  /**
   * Batch execute — for atomic multi-row writes.
   * Accepts the exact shape the driver expects.
   */
  async batch(queries: Array<{ query: string; params: unknown[] }>, options: QueryOptions = {}): Promise<types.ResultSet> {
    // Cast params to the driver's ArrayOrObject type
    const batchQueries = queries.map(q => ({
      query: q.query,
      params: q.params as unknown[],
    }));

    return this.client.batch(batchQueries, {
      prepare: true,
      ...options,
    });
  }

  // ─── Health check ────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: 'ok' | 'error'; latencyMs: number; hosts: string[] }> {
    const start = Date.now();
    try {
      await this.client.execute('SELECT now() FROM system.local', [], { prepare: false });

      // Host is exported from the root cassandra-driver package, not types namespace
      const hosts = this.client.hosts
        .values()
        .filter((h: Host) => h.isUp())
        .map((h: Host) => h.address);

      return { status: 'ok', latencyMs: Date.now() - start, hosts };
    } catch {
      return { status: 'error', latencyMs: Date.now() - start, hosts: [] };
    }
  }

  // ─── Exponential backoff connect ─────────────────────────────────────────────

  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      await this.client.connect();
      logger.info('[Cassandra] Connected');
    } catch (err) {
      if (attempt > CassandraClient.MAX_RETRIES) {
        logger.error('[Cassandra] Max retries reached. Giving up.');
        throw new CassandraError('connect', err);
      }
      const delay = Math.min(CassandraClient.BASE_DELAY_MS * 2 ** (attempt - 1), 60_000);
      logger.warn(`[Cassandra] Attempt ${attempt} failed. Retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      return this.connectWithRetry(attempt + 1);
    }
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get ready(): boolean {
    return this.isReady;
  }

  get rawClient(): Client {
    return this.client;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance: CassandraClient | null = null;

export function getCassandraClient(): CassandraClient {
  if (!instance) instance = new CassandraClient();
  return instance;
}

export async function cassandraConnect(): Promise<void> {
  await getCassandraClient().connect();
}

export async function cassandraDisconnect(): Promise<void> {
  await getCassandraClient().disconnect();
  instance = null;
}
