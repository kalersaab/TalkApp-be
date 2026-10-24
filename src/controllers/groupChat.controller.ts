import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { GroupChatService } from '@services/groupChat.service';
import type { CreateGroupDto, AddMembersDto, RemoveMemberDto, UpdateGroupDto, GetGroupsQueryDto } from '@dtos/chat.dto';

const svc = new GroupChatService();

export const createGroup = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, avatarUrl, memberIds, settings } = req.body as CreateGroupDto;
    const group = await svc.createGroup({
      creatorId: req.user._id.toString(),
      name,
      description,
      avatarUrl,
      memberIds,
      settings,
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const getGroups = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { lastGroupId, limit } = req.query as GetGroupsQueryDto;
    const result = await svc.getGroups({
      userId: req.user._id.toString(),
      limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastGroupId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const getGroupById = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params as { groupId: string };
    const group = await svc.getGroupById(groupId, req.user._id.toString());
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const addMembers = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params as { groupId: string };
    const { memberIds } = req.body as AddMembersDto;
    const group = await svc.addMembers({
      groupId,
      requesterId: req.user._id.toString(),
      memberIds,
    });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params as { groupId: string };
    const { targetUserId } = req.body as RemoveMemberDto;
    const group = await svc.removeMember({
      groupId,
      requesterId: req.user._id.toString(),
      targetUserId,
    });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};

export const leaveGroup = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params as { groupId: string };
    await svc.leaveGroup({
      groupId,
      userId: req.user._id.toString(),
    });
    res.json({ success: true, message: 'Left group successfully' });
  } catch (err) {
    next(err);
  }
};

export const updateGroup = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params as { groupId: string };
    const { name, description, avatarUrl, settings } = req.body as UpdateGroupDto;
    const group = await svc.updateGroup({
      groupId,
      requesterId: req.user._id.toString(),
      name,
      description,
      avatarUrl,
      settings,
    });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
};
