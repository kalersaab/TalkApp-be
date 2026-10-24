import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';

import { verifyAccessToken } from '@utils/jwt';
import { logger } from '@utils/logger';
import { WS_NODE_ID } from '@utils/nodeId';
import { CircuitBreaker } from '@utils/circuitBreaker';
import { getRedisService } from '@databases/redis';
import { getMessageRepository } from '@repositories/message.repository';
import { ShowcaseService } from '@services/showcase.service';
import { StreakService } from '@services/streak.service';
import { GroupChatService } from '@services/groupChat.service';
import { GroupConversationModel } from '@models/groupConversation.model';
import { ConversationModel } from '@models/conversation.model';
import { registerGateway } from '@sockets/gateway.registry';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  SendMessagePayload,
  TypingPayload,
  MessageReadPayload,
  NewMessagePayload,
  JoinGroupPayload,
  LeaveGroupPayload,
} from '@interfaces/socket.interface';

const RATE = { MESSAGE: { limit: 60, window: 60 } } as const;

const cassandraBreaker = new CircuitBreaker({
  name: 'cassandra-write',
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30_000,
});

const redisBreaker = new CircuitBreaker({
  name: 'redis-publish',
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 15_000,
});

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class ChatGateway {
  private io: AppServer;
  private readonly showcaseSvc = new ShowcaseService();
  private readonly streakSvc = new StreakService();
  private readonly groupSvc = new GroupChatService();

  constructor(httpServer: HttpServer) {
    this.io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
      path: '/socket.io',
      cors: {
        origin: process.env['ORIGIN']?.split(',') ?? '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 20_000,
      pingInterval: 25_000,
      maxHttpBufferSize: 1e6,
    });

    registerGateway(this.io);

    this.attachRedisAdapter();
    this.attachAuthMiddleware();
    this.attachConnectionHandler();
  }

  private attachRedisAdapter(): void {
    try {
      const redis = getRedisService();

      const pubClient = (redis as unknown as { data: unknown }).data;
      const subClient = (redis as unknown as { sub: unknown }).sub;
      if (pubClient && subClient) {
        this.io.adapter(createAdapter(pubClient as never, subClient as never));
        logger.info('[ChatGateway] Redis adapter attached');
      }
    } catch (err) {
      logger.warn(`[ChatGateway] Redis adapter skipped: ${(err as Error).message}`);
    }
  }

  private attachAuthMiddleware(): void {
    this.io.use((socket, next) => {
      try {
        const token = (socket.handshake.auth as Record<string, string>)['token'] ?? (socket.handshake.query['token'] as string | undefined);

        if (!token) return next(new Error('AUTH_MISSING'));

        const payload = verifyAccessToken(token);
        socket.data.userId = payload.userId;
        socket.data.email = payload.email;
        next();
      } catch {
        next(new Error('AUTH_INVALID'));
      }
    });
  }

  private attachConnectionHandler(): void {
    this.io.on('connection', (socket: AppSocket) => {
      const { userId } = socket.data;
      logger.info(`[ChatGateway] connected userId=${userId} socketId=${socket.id}`);

      void socket.join(`user:${userId}`);

      void getRedisService()
        .setUserOnline(userId, WS_NODE_ID, socket.id)
        .catch(err => logger.error(`[ChatGateway] setUserOnline: ${(err as Error).message}`));

      void this.flushOfflineQueue(socket);

      socket.emit('connected', { serverTime: new Date().toISOString(), userId });

      socket.on('send_message', payload => void this.handleSendMessage(socket, payload));
      socket.on('typing_start', payload => void this.handleTyping(socket, payload, 'start'));
      socket.on('typing_stop', payload => void this.handleTyping(socket, payload, 'stop'));
      socket.on('message_read', payload => void this.handleMessageRead(socket, payload));
      socket.on('join_group', payload => void this.handleJoinGroup(socket, payload));
      socket.on('leave_group', payload => void this.handleLeaveGroup(socket, payload));
      socket.on('heartbeat', () => void this.handleHeartbeat(socket));
      socket.on('disconnect', reason => void this.handleDisconnect(socket, reason));
    });
  }

  private async handleSendMessage(socket: AppSocket, payload: SendMessagePayload): Promise<void> {
    const { userId } = socket.data;
    const redis = getRedisService();

    const rl = await redis
      .checkRateLimit(`${userId}:message`, RATE.MESSAGE.limit, RATE.MESSAGE.window)
      .catch(() => ({ allowed: true, remaining: 0, resetAt: 0 }));

    if (!rl.allowed) {
      socket.emit('rate_limit_error', {
        code: 'RATE_LIMIT_MESSAGE',
        message: `Too many messages. Try again after ${new Date(rl.resetAt).toISOString()}`,
      });
      return;
    }

    const isGroup = await this.isGroupConversation(payload.convId);

    if (isGroup) {
      const isMember = await this.groupSvc.checkMembership(payload.convId, userId);
      if (!isMember) {
        socket.emit('error', { code: 'NOT_MEMBER', message: 'You are not a member of this group' });
        return;
      }

      const group = await GroupConversationModel.findById(payload.convId).select('settings').lean();
      if (group?.settings.onlyAdminsCanPost) {
        const isAdmin = await this.groupSvc.isAdmin(payload.convId, userId);
        if (!isAdmin) {
          socket.emit('error', { code: 'ADMIN_ONLY', message: 'Only admins can post in this group' });
          return;
        }
      }
    } else {
      const conv = await ConversationModel.findById(payload.convId).select('participantIds').lean();
      if (!conv || !conv.participantIds.some(id => id.toString() === userId)) {
        socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this conversation' });
        return;
      }
    }

    let saved;
    try {
      saved = await cassandraBreaker.call(() =>
        getMessageRepository().saveMessage({
          convId: payload.convId,
          senderId: userId,
          content: payload.content,
          contentType: payload.contentType ?? 'text',
          mediaUrl: payload.mediaUrl ?? null,
        }),
      );
    } catch (err) {
      logger.error(`[ChatGateway] saveMessage: ${(err as Error).message}`);
      socket.emit('error', { code: 'MSG_SAVE_FAILED', message: 'Message could not be saved' });
      return;
    }

    socket.emit('message_ack', {
      clientMsgId: payload.clientMsgId,
      msgId: saved.msgId,
      status: 'sent',
    });

    const senderEquipped = await this.showcaseSvc.getSenderEquipped(userId).catch(() => ({ chatBubble: null, chatBackground: null }));

    const broadcastPayload: NewMessagePayload = {
      msgId: saved.msgId,
      convId: saved.convId,
      senderId: saved.senderId,
      content: saved.content,
      contentType: saved.contentType,
      mediaUrl: saved.mediaUrl,
      status: 'delivered',
      createdAt: saved.createdAt.toISOString(),
      senderEquipped,
    };

    try {
      await redisBreaker.call(() =>
        redis.publishMessage(payload.convId, {
          msgId: saved.msgId,
          convId: saved.convId,
          senderId: saved.senderId,
          content: saved.content,
          contentType: saved.contentType,
          createdAt: saved.createdAt.toISOString(),
        }),
      );
    } catch {
      socket.to(`conv:${payload.convId}`).emit('new_message', broadcastPayload);
    }

    this.io.to(`conv:${payload.convId}`).emit('new_message', broadcastPayload);

    void this.updateLastMessage(payload.convId, userId, saved.content, saved.createdAt, isGroup);

    void this.streakSvc.checkAndUpdateStreak(userId).catch(() => null);
  }

  private async handleTyping(socket: AppSocket, payload: TypingPayload, type: 'start' | 'stop'): Promise<void> {
    socket.to(`conv:${payload.convId}`).emit('typing', {
      convId: payload.convId,
      userId: socket.data.userId,
      type,
    });
  }

  private async handleMessageRead(socket: AppSocket, payload: MessageReadPayload): Promise<void> {
    try {
      await cassandraBreaker.call(() =>
        getMessageRepository().updateMessageStatus({
          convId: payload.convId,
          msgId: payload.msgId,
          status: 'read',
        }),
      );
    } catch (err) {
      logger.warn(`[ChatGateway] updateMessageStatus: ${(err as Error).message}`);
    }

    socket.to(`conv:${payload.convId}`).emit('read_receipt', {
      msgId: payload.msgId,
      readAt: new Date().toISOString(),
    });
  }

  private async handleHeartbeat(socket: AppSocket): Promise<void> {
    await getRedisService()
      .refreshPresence(socket.data.userId)
      .catch(err => logger.warn(`[ChatGateway] refreshPresence: ${(err as Error).message}`));
    socket.emit('heartbeat_ack');
  }

  private async handleDisconnect(socket: AppSocket, reason: string): Promise<void> {
    logger.info(`[ChatGateway] disconnected userId=${socket.data.userId} reason=${reason}`);
    await getRedisService()
      .setUserOffline(socket.data.userId)
      .catch(err => logger.error(`[ChatGateway] setUserOffline: ${(err as Error).message}`));
  }

  private async flushOfflineQueue(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;
    const repo = getMessageRepository();

    try {
      const queued = await repo.getOfflineQueue(userId);
      if (!queued.length) return;

      for (const item of queued) {
        try {
          const msg = JSON.parse(item.payload) as NewMessagePayload;

          if (!msg.senderEquipped) {
            msg.senderEquipped = { chatBubble: null, chatBackground: null };
          }
          socket.emit('new_message', msg);
          await repo.deleteFromOfflineQueue(userId, item.msgId);
        } catch {
          await repo.deleteFromOfflineQueue(userId, item.msgId).catch(() => null);
        }
      }

      logger.info(`[ChatGateway] flushed ${queued.length} offline messages for ${userId}`);
    } catch (err) {
      logger.warn(`[ChatGateway] flushOfflineQueue: ${(err as Error).message}`);
    }
  }

  joinConversation(socketId: string, convId: string): void {
    void this.io.sockets.sockets.get(socketId)?.join(`conv:${convId}`);
  }

  leaveConversation(socketId: string, convId: string): void {
    void this.io.sockets.sockets.get(socketId)?.leave(`conv:${convId}`);
  }

  private async handleJoinGroup(socket: AppSocket, payload: JoinGroupPayload): Promise<void> {
    const { userId } = socket.data;
    const { groupId } = payload;

    try {
      const isMember = await this.groupSvc.checkMembership(groupId, userId);
      if (!isMember) {
        socket.emit('error', { code: 'NOT_MEMBER', message: 'You are not a member of this group' });
        return;
      }

      await socket.join(`conv:${groupId}`);
      logger.info(`[ChatGateway] User ${userId} joined group room ${groupId}`);
    } catch (err) {
      socket.emit('error', { code: 'JOIN_FAILED', message: 'Failed to join group' });
    }
  }

  private async handleLeaveGroup(socket: AppSocket, payload: LeaveGroupPayload): Promise<void> {
    const { groupId } = payload;
    await socket.leave(`conv:${groupId}`);
    logger.info(`[ChatGateway] User ${socket.data.userId} left group room ${groupId}`);
  }

  private async isGroupConversation(convId: string): Promise<boolean> {
    try {
      const group = await GroupConversationModel.findById(convId).select('_id').lean();
      return !!group;
    } catch {
      return false;
    }
  }

  private async updateLastMessage(convId: string, senderId: string, content: string, timestamp: Date, isGroup: boolean): Promise<void> {
    try {
      const lastMessage = {
        text: content.substring(0, 100),
        senderId,
        timestamp,
      };

      if (isGroup) {
        await GroupConversationModel.updateOne({ _id: convId }, { $set: { lastMessage, updatedAt: timestamp } });
      } else {
        await ConversationModel.updateOne({ _id: convId }, { $set: { lastMessage, updatedAt: timestamp } });
      }
    } catch (err) {
      logger.warn(`[ChatGateway] Failed to update last message: ${(err as Error).message}`);
    }
  }

  broadcastGroupMemberJoined(groupId: string, userId: string, displayName: string, avatarUrl: string | null): void {
    this.io.to(`conv:${groupId}`).emit('group_member_joined', {
      groupId,
      userId,
      displayName,
      avatarUrl,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastGroupMemberLeft(groupId: string, userId: string, displayName: string, avatarUrl: string | null): void {
    this.io.to(`conv:${groupId}`).emit('group_member_left', {
      groupId,
      userId,
      displayName,
      avatarUrl,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastGroupUpdated(
    groupId: string,
    updatedBy: string,
    updates: { name?: string; description?: string; avatarUrl?: string; settings?: Record<string, boolean> },
  ): void {
    this.io.to(`conv:${groupId}`).emit('group_updated', {
      groupId,
      ...updates,
      updatedBy,
      timestamp: new Date().toISOString(),
    });
  }

  get server(): AppServer {
    return this.io;
  }
}

let gatewayInstance: ChatGateway | null = null;

export function initChatGateway(httpServer: HttpServer): ChatGateway {
  if (!gatewayInstance) gatewayInstance = new ChatGateway(httpServer);
  return gatewayInstance;
}

export function getChatGateway(): ChatGateway {
  if (!gatewayInstance) throw new Error('ChatGateway not initialised — call initChatGateway first');
  return gatewayInstance;
}
