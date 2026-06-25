import type { types } from 'cassandra-driver';

// ─── Value types ──────────────────────────────────────────────────────────────

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker';

// ─── Core message shape (mirrors the Cassandra row exactly) ──────────────────

export interface CassandraMessage {
  conv_id: types.Uuid;
  msg_id: types.TimeUuid;
  sender_id: types.Uuid;
  content: string;
  content_type: ContentType;
  media_url: string | null;
  status: MessageStatus;
  translations: Map<string, string>;
  is_encrypted: boolean;
  created_at: Date;
}

// ─── Offline queue row ────────────────────────────────────────────────────────

export interface OfflineQueueRow {
  user_id: types.Uuid;
  msg_id: types.TimeUuid;
  conv_id: types.Uuid;
  payload: string; // JSON-serialised CassandraMessage
  created_at: Date;
}

// ─── Input DTOs (callers use plain strings/dates; client converts to Uuid) ────

export interface SaveMessageInput {
  convId: string;
  senderId: string;
  content: string;
  contentType?: ContentType;
  mediaUrl?: string | null;
  isEncrypted?: boolean;
}

export interface UpdateStatusInput {
  convId: string;
  msgId: string; // TimeUUID string
  status: MessageStatus;
}

export interface UpdateTranslationInput {
  convId: string;
  msgId: string;
  lang: string;
  translation: string;
}

export interface AddToOfflineQueueInput {
  userId: string;
  message: CassandraMessage;
}

// ─── Output DTO (what callers receive — plain JS types, no driver types) ──────

export interface MessageDto {
  convId: string;
  msgId: string;
  senderId: string;
  content: string;
  contentType: ContentType;
  mediaUrl: string | null;
  status: MessageStatus;
  translations: Record<string, string>;
  isEncrypted: boolean;
  createdAt: Date;
}

export interface OfflineQueueDto {
  userId: string;
  msgId: string;
  convId: string;
  payload: string;
  createdAt: Date;
}

// ─── Paginated result ─────────────────────────────────────────────────────────

export interface PagedMessages {
  messages: MessageDto[];
  /** Pass back to next call to get the next page. Null when no more pages. */
  pagingState: string | null;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export class CassandraError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Cassandra ${operation} failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'CassandraError';
  }
}
