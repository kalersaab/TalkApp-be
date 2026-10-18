import { Router } from 'express';

import { CreateConversationDto, GetConversationsQueryDto, GetMessagesQueryDto, MarkConversationReadDto } from '@dtos/chat.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { getConversations, createConversation, getMessages, deleteConversation, markConversationRead } from '@controllers/chat.controller';

export class ChatRoute implements Routes {
  public path = '/chat';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // All chat routes require authentication
    this.router.use(AuthMiddleware);

    // GET /api/chat/conversations
    this.router.get(`${this.path}/conversations`, validationMiddleware(GetConversationsQueryDto, 'query', true), getConversations);

    // POST /api/chat/conversations
    this.router.post(`${this.path}/conversations`, validationMiddleware(CreateConversationDto, 'body'), createConversation);

    // GET /api/chat/conversations/:convId/messages
    this.router.get(`${this.path}/conversations/:convId/messages`, validationMiddleware(GetMessagesQueryDto, 'query', true), getMessages);

    // POST /api/chat/conversations/:convId/read
    this.router.post(
      `${this.path}/conversations/:convId/read`,
      validationMiddleware(MarkConversationReadDto, 'body', true),
      markConversationRead,
    );

    // DELETE /api/chat/conversations/:convId
    this.router.delete(`${this.path}/conversations/:convId`, deleteConversation);
  }
}
