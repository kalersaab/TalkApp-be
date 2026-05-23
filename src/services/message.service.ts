import { types as CassandraTypes } from 'cassandra-driver';
import { cassandraClient } from '@databases/cassandra';
import { Message } from '@interfaces/message.interface';
import { logger } from '@utils/logger';

export class MessageService {

  public async saveMessage(senderId: string, roomId: string, recieverId:string, content: string, isBinary: boolean): Promise<Message> {
    const messageId = CassandraTypes.Uuid.random();
    const createdAt = new Date();

    const query = `
      INSERT INTO messages (room_id, created_at, message_id, sender_id, reciever_id, content, is_binary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await cassandraClient.execute(query, [roomId, createdAt, messageId, senderId, recieverId, content, isBinary], { prepare: true });

    logger.info(`Message saved [room=${roomId}, id=${messageId}]`);

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

  public async getMessages(roomId: string, sender_id:string, limit = 50): Promise<Message[]> {
    const query = `
      SELECT room_id, created_at, message_id, sender_id, content, is_binary
      FROM messages
      WHERE room_id = ?
      LIMIT ?
    `;

    const result = await cassandraClient.execute(query, [roomId, limit], { prepare: true });

    return result.rows.reverse().map(row => ({
      message_id: row.message_id.toString(),
      sender_id: row.sender_id,
      reciever_id: row.reciever_id,
      room_id: row.room_id,
      content: row.content,
      is_binary: row.is_binary,
      created_at: row.created_at,
    }));
  }
}
