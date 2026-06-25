import type { ContentType } from './message.interface';

// ─── Conversation response shape ──────────────────────────────────────────────

export interface ParticipantProfile {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: Date | null;
  nativeLang: string;
  learningLangs: string[];
}

export interface ConversationDto {
  _id: string;
  otherParticipant: ParticipantProfile;
  lastMessage: {
    text: string;
    senderId: string;
    timestamp: Date;
  } | null;
  isMutualFriends: boolean;
  updatedAt: Date;
}

// ─── Paginated conversations ──────────────────────────────────────────────────

export interface PagedConversations {
  conversations: ConversationDto[];
  nextCursor: string | null; // last _id for cursor pagination
}

// ─── Service input types ──────────────────────────────────────────────────────

export interface CreateConversationInput {
  requesterId: string;
  targetUserId: string;
}

export interface SaveMessageInput {
  convId: string;
  senderId: string;
  content: string;
  contentType: ContentType;
  mediaUrl?: string | null;
}

export interface GetMessagesInput {
  convId: string;
  requesterId: string;
  limit?: number;
  beforeMsgId?: string;
}

export interface GetConversationsInput {
  userId: string;
  limit?: number;
  lastConvId?: string;
}
