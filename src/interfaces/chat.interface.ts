import type { ContentType } from './message.interface';

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

export interface PagedConversations {
  conversations: ConversationDto[];
  nextCursor: string | null;
}

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

export type GroupMemberRole = 'admin' | 'member';

export interface IGroupMember {
  userId: Types.ObjectId;
  role: GroupMemberRole;
  joinedAt: Date;
}

export interface IGroupConversation {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  avatarUrl?: string;
  members: IGroupMember[];
  createdBy: Types.ObjectId;
  lastMessage?: {
    text: string;
    senderId: Types.ObjectId;
    timestamp: Date;
  };
  settings: {
    onlyAdminsCanPost: boolean;
    approvalRequired: boolean;
    isPrivate: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupConversationDto {
  _id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  members: GroupMemberDto[];
  createdBy: string;
  lastMessage: {
    text: string;
    senderId: string;
    timestamp: Date;
  } | null;
  settings: {
    onlyAdminsCanPost: boolean;
    approvalRequired: boolean;
    isPrivate: boolean;
  };
  memberCount: number;
  updatedAt: Date;
}

export interface GroupMemberDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupMemberRole;
  joinedAt: Date;
  isOnline: boolean;
}

export interface CreateGroupInput {
  creatorId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  memberIds: string[];
  settings?: {
    onlyAdminsCanPost?: boolean;
    approvalRequired?: boolean;
    isPrivate?: boolean;
  };
}

export interface AddMembersInput {
  groupId: string;
  requesterId: string;
  memberIds: string[];
}

export interface RemoveMemberInput {
  groupId: string;
  requesterId: string;
  targetUserId: string;
}

export interface UpdateGroupInput {
  groupId: string;
  requesterId: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  settings?: {
    onlyAdminsCanPost?: boolean;
    approvalRequired?: boolean;
    isPrivate?: boolean;
  };
}

export interface LeaveGroupInput {
  groupId: string;
  userId: string;
}

export interface GetGroupsInput {
  userId: string;
  limit?: number;
  lastGroupId?: string;
}

export interface PagedGroups {
  groups: GroupConversationDto[];
  nextCursor: string | null;
}

import type { Types } from 'mongoose';
