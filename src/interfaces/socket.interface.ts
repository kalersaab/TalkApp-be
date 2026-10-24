import type { ContentType, MessageStatus } from './message.interface';

export interface SocketData {
  userId: string;
  email: string;
}

export interface ClientToServerEvents {
  send_message: (payload: SendMessagePayload) => void;
  typing_start: (payload: TypingPayload) => void;
  typing_stop: (payload: TypingPayload) => void;
  message_read: (payload: MessageReadPayload) => void;
  heartbeat: () => void;
  join_group: (payload: JoinGroupPayload) => void;
  leave_group: (payload: LeaveGroupPayload) => void;
}

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

export interface InterServerEvents {
  ping: () => void;
}

export interface SendMessagePayload {
  convId: string;
  content: string;
  contentType?: ContentType;
  mediaUrl?: string;
  clientMsgId: string;
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
  msgId: string;
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
