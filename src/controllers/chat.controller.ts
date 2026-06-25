import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { ChatService } from '@services/chat.service';
import type { CreateConversationDto, GetMessagesQueryDto, GetConversationsQueryDto } from '@dtos/chat.dto';

const svc = new ChatService();

// ─── GET /api/chat/conversations ──────────────────────────────────────────────

export const getConversations = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { lastConvId, limit } = req.query as GetConversationsQueryDto;
    const result = await svc.getConversations({
      userId: req.user._id.toString(),
      limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastConvId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/chat/conversations ─────────────────────────────────────────────

export const createConversation = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetUserId } = req.body as CreateConversationDto;
    const conv = await svc.createConversation({
      requesterId: req.user._id.toString(),
      targetUserId,
    });
    res.status(201).json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/chat/conversations/:convId/messages ─────────────────────────────

export const getMessages = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { convId } = req.params as { convId: string };
    const { beforeMsgId, limit } = req.query as GetMessagesQueryDto;

    const result = await svc.getMessages({
      convId,
      requesterId: req.user._id.toString(),
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      beforeMsgId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/chat/conversations/:convId ───────────────────────────────────

export const deleteConversation = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { convId } = req.params as { convId: string };
    await svc.softDeleteConversation(convId, req.user._id.toString());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
