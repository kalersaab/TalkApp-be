import Redis from 'ioredis';
import { REDIS_URL } from '@config';
import { logger } from '@utils/logger';

export const redisClient = new Redis(REDIS_URL || 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redisClient.on('error', err => {
  logger.error(`Redis error: ${err.message}`);
});

export async function initRedis(): Promise<void> {
  await redisClient.connect();
  logger.info('Redis client connected');
}

export async function shutdownRedis(): Promise<void> {
  await redisClient.quit();
  logger.info('Redis client disconnected');
}
