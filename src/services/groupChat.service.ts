import { Types } from 'mongoose';

import { GroupConversationModel } from '@models/groupConversation.model';
import { UserModel } from '@models/users.model';
import { getRedisService } from '@databases/redis';
import { getChatGateway } from '@sockets/chat.gateway';
import { HttpException } from '@exceptions/HttpException';
import type {
  GroupConversationDto,
  GroupMemberDto,
  CreateGroupInput,
  AddMembersInput,
  RemoveMemberInput,
  UpdateGroupInput,
  LeaveGroupInput,
  GetGroupsInput,
  PagedGroups,
  IGroupConversation,
  IGroupMember,
} from '@interfaces/chat.interface';
import type { IUser } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

const GROUP_LIST_TTL = 60;
const groupListKey = (userId: string) => `chat:grouplist:${userId}`;

function toGroupMemberDto(member: IGroupMember, user: IUser): GroupMemberDto {
  return {
    userId: member.userId.toString(),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    role: member.role,
    joinedAt: member.joinedAt,
    isOnline: user.isOnline,
  };
}

function toGroupConversationDto(group: IGroupConversation, members: GroupMemberDto[]): GroupConversationDto {
  return {
    _id: group._id.toString(),
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    members,
    createdBy: group.createdBy.toString(),
    lastMessage: group.lastMessage
      ? {
          text: group.lastMessage.text,
          senderId: group.lastMessage.senderId.toString(),
          timestamp: group.lastMessage.timestamp,
        }
      : null,
    settings: group.settings,
    memberCount: members.length,
    updatedAt: group.updatedAt,
  };
}

export class GroupChatService {
  async createGroup(input: CreateGroupInput): Promise<GroupConversationDto> {
    const { creatorId, name, description, avatarUrl, memberIds, settings } = input;

    const allMemberIds = [creatorId, ...memberIds];
    const uniqueMemberIds = [...new Set(allMemberIds)];

    if (uniqueMemberIds.length < 2) {
      throw new HttpException(400, 'A group must have at least 2 members including the creator');
    }

    if (uniqueMemberIds.length > 256) {
      throw new HttpException(400, 'A group cannot have more than 256 members');
    }

    const users = await UserModel.find({
      _id: { $in: uniqueMemberIds.map(id => new Types.ObjectId(id)) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    if (users.length !== uniqueMemberIds.length) {
      throw new HttpException(404, 'One or more user IDs are invalid');
    }

    const members: IGroupMember[] = uniqueMemberIds.map(id => ({
      userId: new Types.ObjectId(id),
      role: id === creatorId ? 'admin' : 'member',
      joinedAt: new Date(),
    }));

    const group = await GroupConversationModel.create({
      name,
      description,
      avatarUrl,
      members,
      createdBy: new Types.ObjectId(creatorId),
      settings: {
        onlyAdminsCanPost: settings?.onlyAdminsCanPost ?? false,
        approvalRequired: settings?.approvalRequired ?? false,
        isPrivate: settings?.isPrivate ?? false,
      },
    });

    const redis = getRedisService();
    await Promise.all(uniqueMemberIds.map(id => redis.invalidateProfile(groupListKey(id)).catch(() => null)));

    const memberDtos = group.members.map(member => {
      const user = users.find(u => u._id.toString() === member.userId.toString())!;
      return toGroupMemberDto(member, user);
    });

    logger.info(`[GroupChat] Group created: ${group._id} by ${creatorId}`);

    return toGroupConversationDto(group.toObject(), memberDtos);
  }

  async getGroups(input: GetGroupsInput): Promise<PagedGroups> {
    const { userId, limit = 20, lastGroupId } = input;
    const redis = getRedisService();

    const cacheKey = groupListKey(userId);
    if (!lastGroupId) {
      try {
        const cached = await redis.getProfile(cacheKey);
        if (cached) return cached as unknown as PagedGroups;
      } catch {}
    }

    const query: Record<string, unknown> = {
      'members.userId': new Types.ObjectId(userId),
    };

    if (lastGroupId) {
      query['_id'] = { $lt: new Types.ObjectId(lastGroupId) };
    }

    const groups = await GroupConversationModel.find(query).sort({ updatedAt: -1 }).limit(limit).lean<IGroupConversation[]>();

    const allMemberIds = groups.flatMap(g => g.members.map(m => m.userId.toString()));
    const uniqueMemberIds = [...new Set(allMemberIds)];

    const users = await UserModel.find({
      _id: { $in: uniqueMemberIds.map(id => new Types.ObjectId(id)) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const groupDtos = groups.map(group => {
      const memberDtos = group.members.map(member => {
        const user = userMap.get(member.userId.toString())!;
        return toGroupMemberDto(member, user);
      });
      return toGroupConversationDto(group, memberDtos);
    });

    const result: PagedGroups = {
      groups: groupDtos,
      nextCursor: groups.length === limit ? groups[groups.length - 1]._id.toString() : null,
    };

    if (!lastGroupId) {
      await redis.cacheProfile(cacheKey, result as unknown as Record<string, unknown>, GROUP_LIST_TTL).catch(() => null);
    }

    return result;
  }

  async getGroupById(groupId: string, requesterId: string): Promise<GroupConversationDto> {
    const group = await GroupConversationModel.findById(groupId).lean<IGroupConversation>();

    if (!group) {
      throw new HttpException(404, 'Group not found');
    }

    const isMember = group.members.some(m => m.userId.toString() === requesterId);
    if (!isMember) {
      throw new HttpException(403, 'You are not a member of this group');
    }

    const memberIds = group.members.map(m => m.userId);
    const users = await UserModel.find({ _id: { $in: memberIds } })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const memberDtos = group.members.map(member => {
      const user = userMap.get(member.userId.toString())!;
      return toGroupMemberDto(member, user);
    });

    return toGroupConversationDto(group, memberDtos);
  }

  async addMembers(input: AddMembersInput): Promise<GroupConversationDto> {
    const { groupId, requesterId, memberIds } = input;

    const group = await GroupConversationModel.findById(groupId);
    if (!group) {
      throw new HttpException(404, 'Group not found');
    }

    const requesterMember = group.members.find(m => m.userId.toString() === requesterId);
    if (!requesterMember) {
      throw new HttpException(403, 'You are not a member of this group');
    }

    if (requesterMember.role !== 'admin') {
      throw new HttpException(403, 'Only admins can add members');
    }

    const uniqueNewIds = [...new Set(memberIds)].filter(id => !group.members.some(m => m.userId.toString() === id));

    if (uniqueNewIds.length === 0) {
      throw new HttpException(400, 'All specified users are already members');
    }

    if (group.members.length + uniqueNewIds.length > 256) {
      throw new HttpException(400, 'Group cannot have more than 256 members');
    }

    const users = await UserModel.find({
      _id: { $in: uniqueNewIds.map(id => new Types.ObjectId(id)) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    if (users.length !== uniqueNewIds.length) {
      throw new HttpException(404, 'One or more user IDs are invalid');
    }

    const newMembers: IGroupMember[] = uniqueNewIds.map(id => ({
      userId: new Types.ObjectId(id),
      role: 'member',
      joinedAt: new Date(),
    }));

    group.members.push(...newMembers);
    await group.save();

    const redis = getRedisService();
    const allAffected = [...group.members.map(m => m.userId.toString()), ...uniqueNewIds];
    await Promise.all(allAffected.map(id => redis.invalidateProfile(groupListKey(id)).catch(() => null)));

    try {
      const gateway = getChatGateway();
      for (const user of users) {
        gateway.broadcastGroupMemberJoined(groupId, user._id.toString(), user.displayName, user.avatarUrl ?? null);
      }
    } catch (err) {
      logger.warn(`[GroupChat] Failed to broadcast member joined: ${(err as Error).message}`);
    }

    logger.info(`[GroupChat] Added ${uniqueNewIds.length} members to group ${groupId}`);

    const allUsers = await UserModel.find({
      _id: { $in: group.members.map(m => m.userId) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));
    const memberDtos = group.members.map(member => {
      const user = userMap.get(member.userId.toString())!;
      return toGroupMemberDto(member, user);
    });

    return toGroupConversationDto(group.toObject(), memberDtos);
  }

  async removeMember(input: RemoveMemberInput): Promise<GroupConversationDto> {
    const { groupId, requesterId, targetUserId } = input;

    const group = await GroupConversationModel.findById(groupId);
    if (!group) {
      throw new HttpException(404, 'Group not found');
    }

    const requesterMember = group.members.find(m => m.userId.toString() === requesterId);
    if (!requesterMember) {
      throw new HttpException(403, 'You are not a member of this group');
    }

    const targetMember = group.members.find(m => m.userId.toString() === targetUserId);
    if (!targetMember) {
      throw new HttpException(404, 'Target user is not a member of this group');
    }

    if (requesterId !== targetUserId && requesterMember.role !== 'admin') {
      throw new HttpException(403, 'Only admins can remove other members');
    }

    if (targetUserId === group.createdBy.toString()) {
      throw new HttpException(400, 'Cannot remove the group creator');
    }

    group.members = group.members.filter(m => m.userId.toString() !== targetUserId);

    if (group.members.length < 2) {
      throw new HttpException(400, 'Cannot remove member: group must have at least 2 members');
    }

    await group.save();

    const redis = getRedisService();
    await Promise.all(
      [...group.members.map(m => m.userId.toString()), targetUserId].map(id => redis.invalidateProfile(groupListKey(id)).catch(() => null)),
    );

    try {
      const targetUser = await UserModel.findById(targetUserId).select('displayName avatarUrl').lean();
      if (targetUser) {
        const gateway = getChatGateway();
        gateway.broadcastGroupMemberLeft(groupId, targetUserId, targetUser.displayName, targetUser.avatarUrl ?? null);
      }
    } catch (err) {
      logger.warn(`[GroupChat] Failed to broadcast member left: ${(err as Error).message}`);
    }

    logger.info(`[GroupChat] Removed member ${targetUserId} from group ${groupId}`);

    const users = await UserModel.find({
      _id: { $in: group.members.map(m => m.userId) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const memberDtos = group.members.map(member => {
      const user = userMap.get(member.userId.toString())!;
      return toGroupMemberDto(member, user);
    });

    return toGroupConversationDto(group.toObject(), memberDtos);
  }

  async leaveGroup(input: LeaveGroupInput): Promise<void> {
    const { groupId, userId } = input;

    await this.removeMember({
      groupId,
      requesterId: userId,
      targetUserId: userId,
    });

    logger.info(`[GroupChat] User ${userId} left group ${groupId}`);
  }

  async updateGroup(input: UpdateGroupInput): Promise<GroupConversationDto> {
    const { groupId, requesterId, name, description, avatarUrl, settings } = input;

    const group = await GroupConversationModel.findById(groupId);
    if (!group) {
      throw new HttpException(404, 'Group not found');
    }

    const requesterMember = group.members.find(m => m.userId.toString() === requesterId);
    if (!requesterMember) {
      throw new HttpException(403, 'You are not a member of this group');
    }

    if (requesterMember.role !== 'admin') {
      throw new HttpException(403, 'Only admins can update group settings');
    }

    if (name !== undefined) group.name = name;
    if (description !== undefined) group.description = description;
    if (avatarUrl !== undefined) group.avatarUrl = avatarUrl;
    if (settings) {
      if (settings.onlyAdminsCanPost !== undefined) group.settings.onlyAdminsCanPost = settings.onlyAdminsCanPost;
      if (settings.approvalRequired !== undefined) group.settings.approvalRequired = settings.approvalRequired;
      if (settings.isPrivate !== undefined) group.settings.isPrivate = settings.isPrivate;
    }

    await group.save();

    const redis = getRedisService();
    await Promise.all(group.members.map(m => redis.invalidateProfile(groupListKey(m.userId.toString())).catch(() => null)));

    try {
      const gateway = getChatGateway();
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (settings) updates.settings = settings;

      gateway.broadcastGroupUpdated(groupId, requesterId, updates);
    } catch (err) {
      logger.warn(`[GroupChat] Failed to broadcast group updated: ${(err as Error).message}`);
    }

    logger.info(`[GroupChat] Updated group ${groupId}`);

    const users = await UserModel.find({
      _id: { $in: group.members.map(m => m.userId) },
    })
      .select('displayName avatarUrl isOnline')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const memberDtos = group.members.map(member => {
      const user = userMap.get(member.userId.toString())!;
      return toGroupMemberDto(member, user);
    });

    return toGroupConversationDto(group.toObject(), memberDtos);
  }

  async checkMembership(groupId: string, userId: string): Promise<boolean> {
    const group = await GroupConversationModel.findById(groupId).select('members').lean();
    if (!group) return false;
    return group.members.some(m => m.userId.toString() === userId);
  }

  async isAdmin(groupId: string, userId: string): Promise<boolean> {
    const group = await GroupConversationModel.findById(groupId).select('members').lean();
    if (!group) return false;
    const member = group.members.find(m => m.userId.toString() === userId);
    return member?.role === 'admin';
  }
}
