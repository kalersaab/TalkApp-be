import mongoose from 'mongoose';
import { DB_HOST, DB_PORT, DB_DATABASE, NODE_ENV } from '@config';
import { logger } from '@utils/logger';

// ─── Connection string ────────────────────────────────────────────────────────
// Supports both:
//   - Replica set:  mongodb://host1:27017,host2:27017,host3:27017/db?replicaSet=rs0
//   - Atlas SRV:    mongodb+srv://user:pass@cluster.mongodb.net/db
//   - Single node:  mongodb://localhost:27017/db  (dev)

function buildConnectionString(): string {
  const host = DB_HOST || 'localhost';
  const db = DB_DATABASE || 'talkapp';

  // Atlas SRV or full URI already provided
  if (host.startsWith('mongodb+srv://') || host.startsWith('mongodb://')) {
    return `${host}/${db}`;
  }

  // Replica set: comma-separated hosts in DB_HOST
  if (host.includes(',')) {
    const replicaSet = process.env.DB_REPLICA_SET || 'rs0';
    return `mongodb://${host}/${db}?replicaSet=${replicaSet}&authSource=admin`;
  }

  // Single node (local dev)
  const port = DB_PORT || '27017';
  return `mongodb://${host}:${port}/${db}`;
}

export const MONGODB_URI = buildConnectionString();

// ─── Connection options ───────────────────────────────────────────────────────

const CONNECTION_OPTIONS: mongoose.ConnectOptions = {
  // Connection pool — sized for high concurrency
  minPoolSize: 5,
  maxPoolSize: 100,

  // Timeouts
  serverSelectionTimeoutMS: 10_000, // give up selecting a server after 10s
  socketTimeoutMS: 45_000,          // close idle sockets after 45s
  connectTimeoutMS: 10_000,

  // Heartbeat — detect dead primaries quickly
  heartbeatFrequencyMS: 10_000,

  // Write concern for replica sets
  w: 'majority',
  journal: true,

  // Slow query profiling threshold (ms) — handled via event listener below
  // (Mongoose doesn't expose this directly; we use the 'commandSucceeded' event)
};

// ─── Slow query logging ───────────────────────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = 100;

function attachSlowQueryLogger(): void {
  const conn = mongoose.connection;

  // mongoose exposes the underlying driver's command monitoring
  conn.on('open', () => {
    const db = conn.db;
    if (!db) return;

    // @ts-ignore — internal driver event emitter
    const client = db.client;
    if (!client?.addListener) return;

    client.addListener('commandSucceeded', (event: { commandName: string; duration: number; requestId: number }) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        logger.warn(`[SlowQuery] ${event.commandName} took ${event.duration}ms (requestId: ${event.requestId})`);
      }
    });
  });
}

// ─── Exponential backoff reconnect ───────────────────────────────────────────

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;

async function connectWithRetry(attempt = 1): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI, CONNECTION_OPTIONS);
  } catch (err) {
    if (attempt > MAX_RETRIES) {
      logger.error(`[MongoDB] Failed after ${MAX_RETRIES} attempts. Exiting.`);
      process.exit(1);
    }

    const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 30_000); // cap at 30s
    logger.warn(`[MongoDB] Connection attempt ${attempt} failed. Retrying in ${delay}ms…`);
    await new Promise(res => setTimeout(res, delay));
    return connectWithRetry(attempt + 1);
  }
}

// ─── Event listeners ─────────────────────────────────────────────────────────

function attachConnectionListeners(): void {
  const conn = mongoose.connection;

  conn.on('connected', () => logger.info('[MongoDB] Connected'));
  conn.on('open', () => logger.info('[MongoDB] Connection open'));

  conn.on('disconnected', () => {
    logger.warn('[MongoDB] Disconnected');
    // Mongoose has built-in auto-reconnect for replica sets via the driver.
    // For single-node dev, trigger manual reconnect.
    if (NODE_ENV !== 'production') {
      logger.info('[MongoDB] Attempting reconnect…');
      void connectWithRetry();
    }
  });

  conn.on('error', err => {
    logger.error(`[MongoDB] Error: ${(err as Error).message}`);
  });

  conn.on('reconnected', () => logger.info('[MongoDB] Reconnected'));

  // Enable slow query logging after connection opens
  attachSlowQueryLogger();
}

// ─── Public API ───────────────────────────────────────────────────────────────

let isConnected = false;

export async function dbConnect(): Promise<void> {
  if (isConnected) return;

  // Enable mongoose debug in non-production
  if (NODE_ENV !== 'production') {
    mongoose.set('debug', (collectionName: string, method: string, query: object) => {
      logger.debug(`[Mongoose] ${collectionName}.${method} ${JSON.stringify(query)}`);
    });
  }

  attachConnectionListeners();
  await connectWithRetry();
  isConnected = true;
}

export async function dbDisconnect(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('[MongoDB] Disconnected gracefully');
}

// ─── Legacy export (keeps existing app.ts working without changes) ────────────

export const dbConnection = {
  url: MONGODB_URI,
  options: CONNECTION_OPTIONS,
};
