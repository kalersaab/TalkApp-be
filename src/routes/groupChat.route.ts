import { Router } from 'express';

import { CreateGroupDto, AddMembersDto, RemoveMemberDto, UpdateGroupDto, GetGroupsQueryDto } from '@dtos/chat.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { createGroup, getGroups, getGroupById, addMembers, removeMember, leaveGroup, updateGroup } from '@controllers/groupChat.controller';

export class GroupChatRoute implements Routes {
  public path = '/chat/groups';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    this.router.post(`${this.path}`, validationMiddleware(CreateGroupDto, 'body'), createGroup);

    this.router.get(`${this.path}`, validationMiddleware(GetGroupsQueryDto, 'query', true), getGroups);

    this.router.get(`${this.path}/:groupId`, getGroupById);

    this.router.post(`${this.path}/:groupId/members`, validationMiddleware(AddMembersDto, 'body'), addMembers);

    this.router.delete(`${this.path}/:groupId/members`, validationMiddleware(RemoveMemberDto, 'body'), removeMember);

    this.router.post(`${this.path}/:groupId/leave`, leaveGroup);

    this.router.patch(`${this.path}/:groupId`, validationMiddleware(UpdateGroupDto, 'body'), updateGroup);
  }
}
