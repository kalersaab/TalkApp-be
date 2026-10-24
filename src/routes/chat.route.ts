import { Router } from 'express';

import { CreateConversationDto, GetConversationsQueryDto, GetMessagesQueryDto } from '@dtos/chat.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { getConversations, createConversation, getMessages, deleteConversation } from '@controllers/chat.controller';

export class ChatRoute implements Routes {
  public path = '/chat';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    this.router.get(`${this.path}/conversations`, validationMiddleware(GetConversationsQueryDto, 'query', true), getConversations);

    this.router.post(`${this.path}/conversations`, validationMiddleware(CreateConversationDto, 'body'), createConversation);

    this.router.get(`${this.path}/conversations/:convId/messages`, validationMiddleware(GetMessagesQueryDto, 'query', true), getMessages);

    this.router.delete(`${this.path}/conversations/:convId`, deleteConversation);
  }
}
