import { Router } from 'express';

import {
  CreateGroupDto,
  AddMembersDto,
  RemoveMemberDto,
  UpdateGroupDto,
  GetGroupsQueryDto,
} from '@dtos/chat.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import {
  createGroup,
  getGroups,
  getGroupById,
  addMembers,
  removeMember,
  leaveGroup,
  updateGroup,
} from '@controllers/groupChat.controller';

export class GroupChatRoute implements Routes {
  public path = '/chat/groups';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // All group chat routes require authentication
    this.router.use(AuthMiddleware);

    // POST /api/chat/groups - Create new group
    this.router.post(`${this.path}`, validationMiddleware(CreateGroupDto, 'body'), createGroup);

    // GET /api/chat/groups - Get user's groups
    this.router.get(`${this.path}`, validationMiddleware(GetGroupsQueryDto, 'query', true), getGroups);

    // GET /api/chat/groups/:groupId - Get specific group details
    this.router.get(`${this.path}/:groupId`, getGroupById);

    // POST /api/chat/groups/:groupId/members - Add members to group
    this.router.post(`${this.path}/:groupId/members`, validationMiddleware(AddMembersDto, 'body'), addMembers);

    // DELETE /api/chat/groups/:groupId/members - Remove member from group
    this.router.delete(`${this.path}/:groupId/members`, validationMiddleware(RemoveMemberDto, 'body'), removeMember);

    // POST /api/chat/groups/:groupId/leave - Leave group
    this.router.post(`${this.path}/:groupId/leave`, leaveGroup);

    // PATCH /api/chat/groups/:groupId - Update group details
    this.router.patch(`${this.path}/:groupId`, validationMiddleware(UpdateGroupDto, 'body'), updateGroup);
  }
}
