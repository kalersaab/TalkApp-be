import mongoose from 'mongoose';
import { DB_HOST, DB_PORT, DB_DATABASE, NODE_ENV } from '@config';
import { logger } from '@utils/logger';

function buildConnectionString(): string {
  const host = DB_HOST || 'localhost';
  const db = DB_DATABASE || 'talkapp';

  if (host.startsWith('mongodb+srv://') || host.startsWith('mongodb://')) {
    return `${host}/${db}`;
  }

  if (host.includes(',')) {
    const replicaSet = process.env.DB_REPLICA_SET || 'rs0';
    return `mongodb://${host}/${db}?replicaSet=${replicaSet}&authSource=admin`;
  }

  const port = DB_PORT || '27017';
  return `mongodb://${host}:${port}/${db}`;
}

export const MONGODB_URI = buildConnectionString();

const CONNECTION_OPTIONS: mongoose.ConnectOptions = {
  minPoolSize: 5,
  maxPoolSize: 100,

  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  connectTimeoutMS: 10_000,

  heartbeatFrequencyMS: 10_000,

  w: 'majority',
  journal: true,
};

const SLOW_QUERY_THRESHOLD_MS = 100;

function attachSlowQueryLogger(): void {
  const conn = mongoose.connection;

  conn.on('open', () => {
    const db = conn.db;
    if (!db) return;

    const client = db.client;
    if (!client?.addListener) return;

    client.addListener('commandSucceeded', (event: { commandName: string; duration: number; requestId: number }) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        logger.warn(`[SlowQuery] ${event.commandName} took ${event.duration}ms (requestId: ${event.requestId})`);
      }
    });
  });
}

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

    const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 30_000);
    logger.warn(`[MongoDB] Connection attempt ${attempt} failed. Retrying in ${delay}ms…`);
    await new Promise(res => setTimeout(res, delay));
    return connectWithRetry(attempt + 1);
  }
}

function attachConnectionListeners(): void {
  const conn = mongoose.connection;

  conn.on('connected', () => logger.info('[MongoDB] Connected'));
  conn.on('open', () => logger.info('[MongoDB] Connection open'));

  conn.on('disconnected', () => {
    logger.warn('[MongoDB] Disconnected');

    if (NODE_ENV !== 'production') {
      logger.info('[MongoDB] Attempting reconnect…');
      void connectWithRetry();
    }
  });

  conn.on('error', err => {
    logger.error(`[MongoDB] Error: ${(err as Error).message}`);
  });

  conn.on('reconnected', () => logger.info('[MongoDB] Reconnected'));

  attachSlowQueryLogger();
}

let isConnected = false;

export async function dbConnect(): Promise<void> {
  if (isConnected) return;

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

export const dbConnection = {
  url: MONGODB_URI,
  options: CONNECTION_OPTIONS,
};
