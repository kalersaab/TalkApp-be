import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { Types } from 'mongoose';

import { verifyAccessToken } from '@utils/jwt';
import { logger } from '@utils/logger';
import { WS_NODE_ID } from '@utils/nodeId';
import { CircuitBreaker } from '@utils/circuitBreaker';
import { getRedisService } from '@databases/redis';
import { getMessageRepository } from '@repositories/message.repository';
import { ShowcaseService } from '@services/showcase.service';
import { StreakService } from '@services/streak.service';
import { GroupChatService } from '@services/groupChat.service';
import { ChatService } from '@services/chat.service';
import { GroupConversationModel } from '@models/groupConversation.model';
import { ConversationModel } from '@models/conversation.model';
import { registerGateway } from '@sockets/gateway.registry';
import type { MessageDto } from '@interfaces/message.interface';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  SendMessagePayload,
  TypingPayload,
  MessageReadPayload,
  MessageDeliveredAckPayload,
  ConversationRoomPayload,
  NewMessagePayload,
  JoinGroupPayload,
  LeaveGroupPayload,
} from '@interfaces/socket.interface';

// ─── Rate limit config ────────────────────────────────────────────────────────

const RATE = { MESSAGE: { limit: 60, window: 60 } } as const;

// How long a client-generated id is remembered so a retried send is not duplicated.
const DEDUPE_TTL = 300; // seconds
const dedupeKey = (senderId: string, clientMsgId: string) => `chat:dedupe:${senderId}:${clientMsgId}`;

// Dialog rooms joined automatically on connect (Telegram keeps every dialog live).
const MAX_ROOMS_PER_SOCKET = 200;

// ─── Circuit breakers ─────────────────────────────────────────────────────────

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

// ─── Typed aliases ────────────────────────────────────────────────────────────

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ─── ChatGateway ──────────────────────────────────────────────────────────────

export class ChatGateway {
  private io: AppServer;
  private readonly showcaseSvc = new ShowcaseService();
  private readonly streakSvc = new StreakService();
  private readonly groupSvc = new GroupChatService();
  private readonly chatSvc = new ChatService();

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

    // Register in the global registry so other services can emit without
    // importing this file (avoids circular dependencies)
    registerGateway(this.io);

    this.attachRedisAdapter();
    this.attachAuthMiddleware();
    this.attachConnectionHandler();
  }

  // ─── Redis adapter ────────────────────────────────────────────────────────

  private attachRedisAdapter(): void {
    try {
      const redis = getRedisService();
      // Access the two underlying ioredis clients via the private fields
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

  // ─── JWT auth middleware ──────────────────────────────────────────────────

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

  // ─── Connection handler ───────────────────────────────────────────────────

  private attachConnectionHandler(): void {
    this.io.on('connection', (socket: AppSocket) => {
      const { userId } = socket.data;
      logger.info(`[ChatGateway] connected userId=${userId} socketId=${socket.id}`);

      // Join personal room for direct pushes (achievements, notifications)
      void socket.join(`user:${userId}`);

      // Join one room per dialog so realtime fan-out works without an explicit
      // subscribe round-trip. The client can still join/leave individual rooms.
      void this.joinUserRooms(socket);

      // Mark online in Redis
      void getRedisService()
        .setUserOnline(userId, WS_NODE_ID, socket.id)
        .catch(err => logger.error(`[ChatGateway] setUserOnline: ${(err as Error).message}`));

      // Flush offline messages
      void this.flushOfflineQueue(socket);

      socket.emit('connected', { serverTime: new Date().toISOString(), userId });

      socket.on('send_message', payload => void this.handleSendMessage(socket, payload));
      socket.on('typing_start', payload => void this.handleTyping(socket, payload, 'start'));
      socket.on('typing_stop', payload => void this.handleTyping(socket, payload, 'stop'));
      socket.on('message_read', payload => void this.handleMessageRead(socket, payload));
      socket.on('message_delivered', payload => void this.handleMessageDelivered(socket, payload));
      socket.on('join_conversation', payload => void this.handleJoinConversation(socket, payload));
      socket.on('leave_conversation', payload => void this.handleLeaveConversation(socket, payload));
      socket.on('join_group', payload => void this.handleJoinGroup(socket, payload));
      socket.on('leave_group', payload => void this.handleLeaveGroup(socket, payload));
      socket.on('heartbeat', () => void this.handleHeartbeat(socket));
      socket.on('disconnect', reason => void this.handleDisconnect(socket, reason));
    });
  }

  // ─── send_message ─────────────────────────────────────────────────────────

  private async handleSendMessage(socket: AppSocket, payload: SendMessagePayload): Promise<void> {
    const { userId } = socket.data;
    const redis = getRedisService();

    // Rate limit
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

    // Check if this is a group or 1-on-1 conversation
    const isGroup = await this.isGroupConversation(payload.convId);

    // For groups, verify membership and permissions
    if (isGroup) {
      const isMember = await this.groupSvc.checkMembership(payload.convId, userId);
      if (!isMember) {
        socket.emit('error', { code: 'NOT_MEMBER', message: 'You are not a member of this group' });
        return;
      }

      // Check if only admins can post
      const group = await GroupConversationModel.findById(payload.convId).select('settings').lean();
      if (group?.settings.onlyAdminsCanPost) {
        const isAdmin = await this.groupSvc.isAdmin(payload.convId, userId);
        if (!isAdmin) {
          socket.emit('error', { code: 'ADMIN_ONLY', message: 'Only admins can post in this group' });
          return;
        }
      }
    } else {
      // For 1-on-1, verify user is a participant
      const conv = await ConversationModel.findById(payload.convId).select('participantIds').lean();
      if (!conv || !conv.participantIds.some(id => id.toString() === userId)) {
        socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this conversation' });
        return;
      }
    }

    // Idempotency: a client that retries after a reconnect must not create a
    // duplicate. Replay the original acknowledgement instead.
    if (payload.clientMsgId) {
      const prior = (await redis.getProfile(dedupeKey(userId, payload.clientMsgId)).catch(() => null)) as { msgId?: string } | null;
      if (prior?.msgId) {
        socket.emit('message_ack', { clientMsgId: payload.clientMsgId, msgId: prior.msgId, status: 'sent' });
        return;
      }
    }

    // Persist to Cassandra
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

    if (payload.clientMsgId) {
      await redis.cacheProfile(dedupeKey(userId, payload.clientMsgId), { msgId: saved.msgId, convId: saved.convId }, DEDUPE_TTL).catch(() => null);
    }

    // Ack to sender — the client reconciles its optimistic echo with this id.
    socket.emit('message_ack', {
      clientMsgId: payload.clientMsgId,
      msgId: saved.msgId,
      status: 'sent',
    });

    await this.deliverMessage(saved, { senderId: userId, isGroup });
  }

  // ─── deliverMessage (single owner of fan-out) ─────────────────────────────

  /**
   * Fan a persisted message out to its conversation: live emit for connected
   * participants, durable offline hand-off for the rest, unread counters for the
   * recipients and the conversation preview update. Persists nothing itself.
   */
  async deliverMessage(saved: MessageDto, opts: { senderId: string; isGroup: boolean }): Promise<void> {
    const { senderId, isGroup } = opts;
    const redis = getRedisService();

    // Fetch sender's equipped cosmetic items for the broadcast payload
    const senderEquipped = await this.showcaseSvc.getSenderEquipped(senderId).catch(() => ({ chatBubble: null, chatBackground: null }));

    const broadcastPayload: NewMessagePayload = {
      msgId: saved.msgId,
      convId: saved.convId,
      senderId: saved.senderId,
      content: saved.content,
      contentType: saved.contentType,
      mediaUrl: saved.mediaUrl,
      status: 'sent',
      createdAt: saved.createdAt.toISOString(),
      senderEquipped,
    };

    // Fan-out via Redis pub/sub
    try {
      await redisBreaker.call(() =>
        redis.publishMessage(saved.convId, {
          msgId: saved.msgId,
          convId: saved.convId,
          senderId: saved.senderId,
          content: saved.content,
          contentType: saved.contentType,
          createdAt: saved.createdAt.toISOString(),
        }),
      );
    } catch (err) {
      logger.warn(`[ChatGateway] publishMessage: ${(err as Error).message}`);
    }

    // Broadcast to the conversation/group room (all nodes via the Redis adapter).
    // The sender is in the room too and reconciles by msgId.
    this.io.to(`conv:${saved.convId}`).emit('new_message', broadcastPayload);

    const participants = await this.participantIds(saved.convId, isGroup);
    const recipients = participants.filter(id => id !== senderId);

    // Durable hand-off: offline recipients get the message on reconnect, then
    // confirm delivery with `message_delivered`.
    for (const recipientId of recipients) {
      const online = await redis.isUserOnline(recipientId).catch(() => false);
      if (online) continue;

      await this.chatSvc
        .saveToOfflineQueue(recipientId, saved)
        .catch(err => logger.warn(`[ChatGateway] saveToOfflineQueue(${recipientId}): ${(err as Error).message}`));
    }

    // Unread counters are modelled for 1-on-1 conversations only.
    if (!isGroup) {
      void this.chatSvc.incrementUnreadCounts(saved.convId, recipients, senderId);
    }

    // Update last message in MongoDB (for both 1-on-1 and groups)
    void this.updateLastMessage(saved.convId, senderId, saved.content, saved.createdAt, isGroup);

    // Update streak (non-blocking)
    void this.streakSvc.checkAndUpdateStreak(senderId).catch(() => null);
  }

  // ─── typing ───────────────────────────────────────────────────────────────

  private async handleTyping(socket: AppSocket, payload: TypingPayload, type: 'start' | 'stop'): Promise<void> {
    socket.to(`conv:${payload.convId}`).emit('typing', {
      convId: payload.convId,
      userId: socket.data.userId,
      type,
    });
  }

  // ─── message_read ─────────────────────────────────────────────────────────

  private async handleMessageRead(socket: AppSocket, payload: MessageReadPayload): Promise<void> {
    const { userId } = socket.data;
    const { convId, msgId } = payload;

    if (!(await this.isParticipant(convId, userId))) {
      socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this conversation' });
      return;
    }

    try {
      await this.chatSvc.markConversationRead({ convId, userId, msgId });
    } catch (err) {
      logger.warn(`[ChatGateway] markConversationRead: ${(err as Error).message}`);
    }

    // Tell the sender (the reader is excluded) that their message was read.
    socket.to(`conv:${convId}`).emit('read_receipt', {
      msgId,
      convId,
      readAt: new Date().toISOString(),
    });
  }

  // ─── message_delivered ────────────────────────────────────────────────────

  private async handleMessageDelivered(socket: AppSocket, payload: MessageDeliveredAckPayload): Promise<void> {
    const { userId } = socket.data;
    const { convId, msgId } = payload;

    if (!convId || !msgId) return;

    if (!(await this.isParticipant(convId, userId))) {
      socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this conversation' });
      return;
    }

    try {
      await cassandraBreaker.call(() => getMessageRepository().updateMessageStatus({ convId, msgId, status: 'delivered' }));
    } catch (err) {
      logger.warn(`[ChatGateway] updateMessageStatus(delivered): ${(err as Error).message}`);
    }

    // The sender is in the room; the acknowledging device is excluded.
    socket.to(`conv:${convId}`).emit('message_delivered', {
      msgId,
      convId,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
    });
  }

  // ─── heartbeat ────────────────────────────────────────────────────────────

  private async handleHeartbeat(socket: AppSocket): Promise<void> {
    await getRedisService()
      .refreshPresence(socket.data.userId)
      .catch(err => logger.warn(`[ChatGateway] refreshPresence: ${(err as Error).message}`));
    socket.emit('heartbeat_ack');
  }

  // ─── disconnect ───────────────────────────────────────────────────────────

  private async handleDisconnect(socket: AppSocket, reason: string): Promise<void> {
    logger.info(`[ChatGateway] disconnected userId=${socket.data.userId} reason=${reason}`);
    await getRedisService()
      .setUserOffline(socket.data.userId)
      .catch(err => logger.error(`[ChatGateway] setUserOffline: ${(err as Error).message}`));
  }

  // ─── Offline queue flush ──────────────────────────────────────────────────

  private async flushOfflineQueue(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;
    const repo = getMessageRepository();

    try {
      const queued = await repo.getOfflineQueue(userId);
      if (!queued.length) return;

      for (const item of queued) {
        try {
          const msg = JSON.parse(item.payload) as NewMessagePayload;
          // Ensure senderEquipped is present (older queued messages may not have it)
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

  // ─── Room management ──────────────────────────────────────────────────────

  /**
   * Join one room per dialog the user belongs to, so messages are pushed
   * without an explicit subscribe per conversation.
   */
  private async joinUserRooms(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;

    try {
      const [convs, groups] = await Promise.all([
        ConversationModel.find({ participantIds: new Types.ObjectId(userId) })
          .select('_id')
          .sort({ updatedAt: -1 })
          .limit(MAX_ROOMS_PER_SOCKET)
          .lean(),
        GroupConversationModel.find({ 'members.userId': new Types.ObjectId(userId) })
          .select('_id')
          .limit(MAX_ROOMS_PER_SOCKET)
          .lean(),
      ]);

      const roomIds = [...convs, ...groups].map(doc => doc._id.toString());
      await Promise.all(roomIds.map(convId => socket.join(`conv:${convId}`)));
      logger.info(`[ChatGateway] userId=${userId} joined ${roomIds.length} conversation rooms`);
    } catch (err) {
      logger.warn(`[ChatGateway] joinUserRooms: ${(err as Error).message}`);
    }
  }

  private async handleJoinConversation(socket: AppSocket, payload: ConversationRoomPayload): Promise<void> {
    const { userId } = socket.data;
    if (!(await this.isParticipant(payload.convId, userId))) {
      socket.emit('error', { code: 'NOT_PARTICIPANT', message: 'You are not a participant in this conversation' });
      return;
    }

    await socket.join(`conv:${payload.convId}`);
  }

  private async handleLeaveConversation(socket: AppSocket, payload: ConversationRoomPayload): Promise<void> {
    await socket.leave(`conv:${payload.convId}`);
  }

  joinConversation(socketId: string, convId: string): void {
    void this.io.sockets.sockets.get(socketId)?.join(`conv:${convId}`);
  }

  leaveConversation(socketId: string, convId: string): void {
    void this.io.sockets.sockets.get(socketId)?.leave(`conv:${convId}`);
  }

  // ─── Group Management ─────────────────────────────────────────────────────

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

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private async isGroupConversation(convId: string): Promise<boolean> {
    try {
      const group = await GroupConversationModel.findById(convId).select('_id').lean();
      return !!group;
    } catch {
      return false;
    }
  }

  /** Participant ids of a conversation, or [] when it cannot be resolved. */
  private async participantIds(convId: string, isGroup: boolean): Promise<string[]> {
    try {
      if (isGroup) {
        const group = await GroupConversationModel.findById(convId).select('members').lean();
        return (group?.members ?? []).map(m => m.userId.toString());
      }

      const conv = await ConversationModel.findById(convId).select('participantIds').lean();
      return (conv?.participantIds ?? []).map(id => id.toString());
    } catch (err) {
      logger.warn(`[ChatGateway] participantIds: ${(err as Error).message}`);
      return [];
    }
  }

  private async isParticipant(convId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(convId)) return false;
    const ids = await this.participantIds(convId, await this.isGroupConversation(convId));
    return ids.includes(userId);
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

  // ─── Group Event Broadcasting ─────────────────────────────────────────────

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

// ─── Singleton ────────────────────────────────────────────────────────────────

let gatewayInstance: ChatGateway | null = null;

export function initChatGateway(httpServer: HttpServer): ChatGateway {
  if (!gatewayInstance) gatewayInstance = new ChatGateway(httpServer);
  return gatewayInstance;
}

export function getChatGateway(): ChatGateway {
  if (!gatewayInstance) throw new Error('ChatGateway not initialised — call initChatGateway first');
  return gatewayInstance;
}
