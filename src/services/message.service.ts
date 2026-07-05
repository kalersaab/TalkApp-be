import { types as CassandraTypes } from 'cassandra-driver';
import { cassandraClient } from '@databases/cassandra';
import { redisClient } from '@databases/redis';
import { Message } from '@interfaces/message.interface';
import { logger } from '@utils/logger';

const CACHE_TTL_SECONDS = 60; // cached history expires after 60 s

function cacheKey(roomId: string, limit: number): string {
  return `messages:${roomId}:${limit}`;
}

export class MessageService {
  public async saveMessage(senderId: string, roomId: string, recieverId: string, content: string, isBinary: boolean): Promise<Message> {
    const messageId = CassandraTypes.Uuid.random();
    const createdAt = new Date();

    const query = `
      INSERT INTO messages (room_id, created_at, message_id, sender_id, reciever_id, content, is_binary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await cassandraClient.execute(query, [roomId, createdAt, messageId, senderId, recieverId, content, isBinary], { prepare: true });

    logger.info(`Message saved [room=${roomId}, id=${messageId}]`);

    // Invalidate all cached history for this room so the next getMessages
    // call fetches fresh data from Cassandra.
    try {
      const pattern = `messages:${roomId}:*`;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.info(`Cache invalidated for room ${roomId} (${keys.length} key(s))`);
      }
    } catch (err) {
      logger.warn(`Redis cache invalidation failed for room ${roomId}: ${(err as Error).message}`);
    }

    return {
      message_id: messageId.toString(),
      sender_id: senderId,
      reciever_id: recieverId,
      room_id: roomId,
      content,
      is_binary: isBinary,
      created_at: createdAt,
    };
  }

  public async getMessages(roomId: string, limit = 50): Promise<Message[]> {
    const key = cacheKey(roomId, limit);

    // 1. Try cache first
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        logger.info(`Cache hit for room ${roomId}`);
        return JSON.parse(cached) as Message[];
      }
    } catch (err) {
      logger.warn(`Redis read failed, falling back to Cassandra: ${(err as Error).message}`);
    }

    // 2. Fetch from Cassandra
    const query = `
      SELECT room_id, created_at, message_id, sender_id, reciever_id, content, is_binary
      FROM messages
      WHERE room_id = ?
      LIMIT ?
    `;

    const result = await cassandraClient.execute(query, [roomId, limit], { prepare: true });

    const messages: Message[] = result.rows.reverse().map(row => ({
      message_id: row.message_id.toString(),
      sender_id: row.sender_id,
      reciever_id: row.reciever_id,
      room_id: row.room_id,
      content: row.content,
      is_binary: row.is_binary,
      created_at: row.created_at,
    }));

    // 3. Populate cache
    try {
      await redisClient.set(key, JSON.stringify(messages), 'EX', CACHE_TTL_SECONDS);
      logger.info(`Cache populated for room ${roomId}`);
    } catch (err) {
      logger.warn(`Redis write failed: ${(err as Error).message}`);
    }

    return messages;
  }
}
