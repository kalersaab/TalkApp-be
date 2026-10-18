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
  /** Recipient confirms delivery of a message it received. */
  message_delivered: (payload: MessageDeliveredAckPayload) => void;
  heartbeat: () => void;
  join_conversation: (payload: ConversationRoomPayload) => void;
  leave_conversation: (payload: ConversationRoomPayload) => void;
  join_group: (payload: JoinGroupPayload) => void;
  leave_group: (payload: LeaveGroupPayload) => void;
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
  group_member_joined: (payload: GroupMemberEventPayload) => void;
  group_member_left: (payload: GroupMemberEventPayload) => void;
  group_updated: (payload: GroupUpdatedPayload) => void;
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

export interface MessageDeliveredAckPayload {
  convId: string;
  msgId: string;
}

export interface ConversationRoomPayload {
  convId: string;
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
  convId: string;
  status: MessageStatus;
  deliveredAt: string;
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
  convId: string;
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

// ─── Group Chat Payloads ──────────────────────────────────────────────────────

export interface JoinGroupPayload {
  groupId: string;
}

export interface LeaveGroupPayload {
  groupId: string;
}

export interface GroupMemberEventPayload {
  groupId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  timestamp: string;
}

export interface GroupUpdatedPayload {
  groupId: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  settings?: {
    onlyAdminsCanPost?: boolean;
    approvalRequired?: boolean;
    isPrivate?: boolean;
  };
  updatedBy: string;
  timestamp: string;
}
