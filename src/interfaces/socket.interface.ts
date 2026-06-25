import type { ContentType, MessageStatus } from './message.interface';

// ─── Socket data attached per connection ──────────────────────────────────────

export interface SocketData {
  userId: string;
  email: string;
}

// ─── Client → Server events ───────────────────────────────────────────────────

export interface ClientToServerEvents {
  send_message: (payload: SendMessagePayload) => void;
  typing_start: (payload: TypingPayload) => void;
  typing_stop: (payload: TypingPayload) => void;
  message_read: (payload: MessageReadPayload) => void;
  heartbeat: () => void;
}

// ─── Server → Client events ───────────────────────────────────────────────────

export interface ServerToClientEvents {
  connected: (payload: ConnectedPayload) => void;
  message_ack: (payload: MessageAckPayload) => void;
  message_delivered: (payload: MessageDeliveredPayload) => void;
  new_message: (payload: NewMessagePayload) => void;
  typing: (payload: TypingEventPayload) => void;
  read_receipt: (payload: ReadReceiptPayload) => void;
  heartbeat_ack: () => void;
  rate_limit_error: (payload: ErrorPayload) => void;
  error: (payload: ErrorPayload) => void;
  achievement_unlocked: (payload: AchievementUnlockedPayload) => void;
  rank_changed: (payload: RankChangedPayload) => void;
}

// ─── Inter-server events (Redis adapter) ─────────────────────────────────────

export interface InterServerEvents {
  ping: () => void;
}

// ─── Payload shapes ───────────────────────────────────────────────────────────

export interface SendMessagePayload {
  convId: string;
  content: string;
  contentType?: ContentType;
  mediaUrl?: string;
  clientMsgId: string; // client-generated idempotency key
}

export interface TypingPayload {
  convId: string;
}

export interface MessageReadPayload {
  convId: string;
  msgId: string;
}

export interface ConnectedPayload {
  serverTime: string;
  userId: string;
}

export interface MessageAckPayload {
  clientMsgId: string;
  msgId: string; // server-assigned TIMEUUID
  status: MessageStatus;
}

export interface MessageDeliveredPayload {
  msgId: string;
  status: MessageStatus;
}

export interface NewMessagePayload {
  msgId: string;
  convId: string;
  senderId: string;
  content: string;
  contentType: ContentType;
  mediaUrl: string | null;
  status: MessageStatus;
  createdAt: string;
  /** Sender's equipped cosmetic items — client uses these to render the correct bubble/background */
  senderEquipped: {
    chatBubble: string | null;
    chatBackground: string | null;
  };
}

export interface TypingEventPayload {
  convId: string;
  userId: string;
  type: 'start' | 'stop';
}

export interface ReadReceiptPayload {
  msgId: string;
  readAt: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface AchievementUnlockedPayload {
  achievementType: string;
  medalTier: string;
  earnedAt: string;
  unlockedItem: { itemId: string; itemType: string } | null;
  newRank: string | null;
}

export interface RankChangedPayload {
  oldRank: string;
  newRank: string;
}
