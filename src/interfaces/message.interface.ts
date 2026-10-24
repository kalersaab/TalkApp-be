import type { types } from 'cassandra-driver';

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker';

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

export interface OfflineQueueRow {
  user_id: types.Uuid;
  msg_id: types.TimeUuid;
  conv_id: types.Uuid;
  payload: string;
  created_at: Date;
}

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
  msgId: string;
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

export interface PagedMessages {
  messages: MessageDto[];

  pagingState: string | null;
}

export class CassandraError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Cassandra ${operation} failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'CassandraError';
  }
}
