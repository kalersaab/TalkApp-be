import { types } from 'cassandra-driver';

import { getCassandraClient, CQL } from '@databases/cassandra';
import type {
  MessageDto,
  OfflineQueueDto,
  PagedMessages,
  SaveMessageInput,
  UpdateStatusInput,
  UpdateTranslationInput,
  AddToOfflineQueueInput,
  MessageStatus,
  ContentType,
} from '@interfaces/message.interface';
import { CassandraError } from '@interfaces/message.interface';
import { logger } from '@utils/logger';

// ─── Row → DTO mappers ────────────────────────────────────────────────────────

function rowToMessageDto(row: types.Row): MessageDto {
  return {
    convId: row['conv_id'].toString(),
    msgId: row['msg_id'].toString(),
    senderId: row['sender_id'].toString(),
    content: row['content'] as string,
    contentType: row['content_type'] as ContentType,
    mediaUrl: (row['media_url'] as string | null) ?? null,
    status: row['status'] as MessageStatus,
    // Cassandra MAP<TEXT,TEXT> comes back as a JS Map
    translations: row['translations'] ? Object.fromEntries((row['translations'] as Map<string, string>).entries()) : {},
    isEncrypted: (row['is_encrypted'] as boolean) ?? false,
    createdAt: row['created_at'] as Date,
  };
}

function rowToOfflineDto(row: types.Row): OfflineQueueDto {
  return {
    userId: row['user_id'].toString(),
    msgId: row['msg_id'].toString(),
    convId: row['conv_id'].toString(),
    payload: row['payload'] as string,
    createdAt: row['created_at'] as Date,
  };
}

// ─── MessageRepository ────────────────────────────────────────────────────────

export class MessageRepository {
  private get db() {
    return getCassandraClient();
  }

  // ── saveMessage ─────────────────────────────────────────────────────────────

  /**
   * Persist a new message to the messages table.
   * msg_id is a TIMEUUID generated server-side so ordering is guaranteed.
   */
  async saveMessage(input: SaveMessageInput): Promise<MessageDto> {
    const convId = types.Uuid.fromString(input.convId);
    const msgId = types.TimeUuid.now();
    const senderId = types.Uuid.fromString(input.senderId);
    const now = new Date();

    const params = [
      convId,
      msgId,
      senderId,
      input.content,
      input.contentType ?? 'text',
      input.mediaUrl ?? null,
      'sent' satisfies MessageStatus,
      new Map<string, string>(), // empty translations map
      input.isEncrypted ?? false,
      now,
    ];

    try {
      await this.db.execute(CQL.INSERT_MESSAGE, params);

      logger.debug(`[MessageRepo] saved msg ${msgId} in conv ${convId}`);

      return {
        convId: convId.toString(),
        msgId: msgId.toString(),
        senderId: senderId.toString(),
        content: input.content,
        contentType: input.contentType ?? 'text',
        mediaUrl: input.mediaUrl ?? null,
        status: 'sent',
        translations: {},
        isEncrypted: input.isEncrypted ?? false,
        createdAt: now,
      };
    } catch (err) {
      throw new CassandraError('saveMessage', err);
    }
  }

  // ── getMessages ─────────────────────────────────────────────────────────────

  /**
   * Fetch messages for a conversation, newest first (CLUSTERING ORDER DESC).
   * Pass `beforeMsgId` for cursor-based pagination — returns messages older
   * than that TimeUUID, which avoids OFFSET scans entirely.
   */
  async getMessages(convId: string, limit = 50, beforeMsgId?: string): Promise<PagedMessages> {
    const convUuid = types.Uuid.fromString(convId);
    const safeLimit = Math.min(limit, 200); // hard cap

    try {
      let result: types.ResultSet;

      if (beforeMsgId) {
        const beforeUuid = types.TimeUuid.fromString(beforeMsgId);
        result = await this.db.execute(CQL.SELECT_MESSAGES_BEFORE, [convUuid, beforeUuid, safeLimit], { fetchSize: safeLimit });
      } else {
        result = await this.db.execute(CQL.SELECT_MESSAGES, [convUuid, safeLimit], { fetchSize: safeLimit });
      }

      const messages = result.rows.map(rowToMessageDto);

      // Encode the driver's paging state as a base64 string for the client
      const pagingState = result.pageState ? Buffer.from(result.pageState).toString('base64') : null;

      return { messages, pagingState };
    } catch (err) {
      throw new CassandraError('getMessages', err);
    }
  }

  // ── getMessageById ───────────────────────────────────────────────────────────

  /** Fetch a single message by its partition key (convId) and clustering key (msgId). */
  async getMessageById(convId: string, msgId: string): Promise<MessageDto | null> {
    const convUuid = types.Uuid.fromString(convId);
    const msgUuid = types.TimeUuid.fromString(msgId);

    try {
      const result = await this.db.execute(CQL.SELECT_MESSAGE_BY_ID, [convUuid, msgUuid]);
      if (!result.rows.length) return null;
      return rowToMessageDto(result.rows[0]!);
    } catch (err) {
      throw new CassandraError('getMessageById', err);
    }
  }

  // ── updateMessageStatus ──────────────────────────────────────────────────────

  async updateMessageStatus(input: UpdateStatusInput): Promise<void> {
    const convUuid = types.Uuid.fromString(input.convId);
    const msgUuid = types.TimeUuid.fromString(input.msgId);

    try {
      await this.db.execute(CQL.UPDATE_STATUS, [input.status, convUuid, msgUuid]);
      logger.debug(`[MessageRepo] status → ${input.status} for msg ${input.msgId}`);
    } catch (err) {
      throw new CassandraError('updateMessageStatus', err);
    }
  }

  // ── updateMessageTranslation ─────────────────────────────────────────────────

  /**
   * Appends a single lang→translation entry to the translations MAP.
   * Cassandra MAP + operator merges without overwriting other keys.
   */
  async updateMessageTranslation(input: UpdateTranslationInput): Promise<void> {
    const convUuid = types.Uuid.fromString(input.convId);
    const msgUuid = types.TimeUuid.fromString(input.msgId);
    const translationMap = new Map([[input.lang, input.translation]]);

    try {
      await this.db.execute(CQL.UPDATE_TRANSLATION, [translationMap, convUuid, msgUuid]);
      logger.debug(`[MessageRepo] translation added lang=${input.lang} for msg ${input.msgId}`);
    } catch (err) {
      throw new CassandraError('updateMessageTranslation', err);
    }
  }

  // ── getOfflineQueue ──────────────────────────────────────────────────────────

  /**
   * Returns all queued messages for a user, ordered by msg_id ASC
   * (oldest first — deliver in order).
   */
  async getOfflineQueue(userId: string): Promise<OfflineQueueDto[]> {
    const userUuid = types.Uuid.fromString(userId);

    try {
      const result = await this.db.execute(CQL.SELECT_OFFLINE, [userUuid]);
      return result.rows.map(rowToOfflineDto);
    } catch (err) {
      throw new CassandraError('getOfflineQueue', err);
    }
  }

  // ── addToOfflineQueue ────────────────────────────────────────────────────────

  /**
   * Stores a message for a user who is currently offline.
   * The row TTL (604800 s = 7 days) is set at the table level.
   */
  async addToOfflineQueue(input: AddToOfflineQueueInput): Promise<void> {
    const userUuid = types.Uuid.fromString(input.userId);
    const msgUuid = types.TimeUuid.fromString(input.message.msg_id.toString());
    const convUuid = input.message.conv_id;
    const payload = JSON.stringify(input.message);
    const now = new Date();

    try {
      await this.db.execute(CQL.INSERT_OFFLINE, [userUuid, msgUuid, convUuid, payload, now]);
      logger.debug(`[MessageRepo] queued msg ${msgUuid} for offline user ${input.userId}`);
    } catch (err) {
      throw new CassandraError('addToOfflineQueue', err);
    }
  }

  // ── deleteFromOfflineQueue ───────────────────────────────────────────────────

  /** Called after successful delivery to clean up the queue row. */
  async deleteFromOfflineQueue(userId: string, msgId: string): Promise<void> {
    const userUuid = types.Uuid.fromString(userId);
    const msgUuid = types.TimeUuid.fromString(msgId);

    try {
      await this.db.execute(CQL.DELETE_OFFLINE, [userUuid, msgUuid]);
      logger.debug(`[MessageRepo] dequeued msg ${msgId} for user ${userId}`);
    } catch (err) {
      throw new CassandraError('deleteFromOfflineQueue', err);
    }
  }

  // ── healthCheck ──────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: 'ok' | 'error'; latencyMs: number; hosts: string[] }> {
    return this.db.healthCheck();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let repoInstance: MessageRepository | null = null;

export function getMessageRepository(): MessageRepository {
  if (!repoInstance) repoInstance = new MessageRepository();
  return repoInstance;
}
