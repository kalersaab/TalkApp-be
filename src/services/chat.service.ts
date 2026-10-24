import { Types } from 'mongoose';

import { ConversationModel } from '@models/conversation.model';
import { GroupConversationModel } from '@models/groupConversation.model';
import { UserModel } from '@models/users.model';
import { getMessageRepository } from '@repositories/message.repository';
import { getRedisService } from '@databases/redis';
import { CassandraWriteError, CassandraReadError, ConversationNotFoundError, UnauthorizedConversationError } from '@exceptions/ChatException';
import { CassandraError } from '@interfaces/message.interface';
import type {
  ConversationDto,
  PagedConversations,
  ParticipantProfile,
  CreateConversationInput,
  GetConversationsInput,
  GetMessagesInput,
} from '@interfaces/chat.interface';
import type { MessageDto, PagedMessages, MessageStatus } from '@interfaces/message.interface';
import type { IConversation, IUser } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

const CONV_LIST_TTL = 60;
const convListKey = (userId: string) => `chat:convlist:${userId}`;

function toParticipantProfile(user: IUser): ParticipantProfile {
  return {
    _id: user._id.toString(),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    nativeLang: user.nativeLang,
    learningLangs: user.learningLangs,
  };
}

function toConversationDto(conv: IConversation, otherUser: IUser): ConversationDto {
  return {
    _id: conv._id.toString(),
    otherParticipant: toParticipantProfile(otherUser),
    lastMessage: conv.lastMessage
      ? {
          text: conv.lastMessage.text,
          senderId: conv.lastMessage.senderId.toString(),
          timestamp: conv.lastMessage.timestamp,
        }
      : null,
    isMutualFriends: conv.isMutualFriends,
    updatedAt: conv.updatedAt,
  };
}

export class ChatService {
  private readonly repo = getMessageRepository();

  async getConversations(input: GetConversationsInput): Promise<PagedConversations> {
    const { userId, limit = 20, lastConvId } = input;
    const redis = getRedisService();

    const cacheKey = convListKey(userId);
    if (!lastConvId) {
      try {
        const cached = await redis.getProfile(cacheKey);
        if (cached) return cached as unknown as PagedConversations;
      } catch {}
    }

    const query: Record<string, unknown> = {
      participantIds: new Types.ObjectId(userId),
    };

    if (lastConvId) {
      query['_id'] = { $lt: new Types.ObjectId(lastConvId) };
    }

    const conversations = await ConversationModel.find(query).sort({ updatedAt: -1 }).limit(limit).lean<IConversation[]>();

    const otherIds = conversations.map(c => {
      const ids = c.participantIds.map(id => id.toString());
      return ids.find(id => id !== userId) ?? ids[0];
    });

    const users = await UserModel.find({
      _id: { $in: otherIds.map(id => new Types.ObjectId(id)) },
    })
      .select('displayName avatarUrl isOnline lastSeen nativeLang learningLangs')
      .lean<IUser[]>();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const dtos: ConversationDto[] = conversations
      .map(conv => {
        const otherId = conv.participantIds.map(id => id.toString()).find(id => id !== userId);
        const otherUser = otherId ? userMap.get(otherId) : undefined;
        if (!otherUser) return null;
        return toConversationDto(conv, otherUser);
      })
      .filter((c): c is ConversationDto => c !== null);

    const nextCursor = conversations.length === limit ? conversations[conversations.length - 1]._id.toString() : null;

    const result: PagedConversations = { conversations: dtos, nextCursor };

    if (!lastConvId) {
      await redis.cacheProfile(cacheKey, result as unknown as Record<string, unknown>, CONV_LIST_TTL).catch(() => null);
    }

    return result;
  }

  async createConversation(input: CreateConversationInput): Promise<ConversationDto> {
    const { requesterId, targetUserId } = input;

    const targetUser = await UserModel.findById(targetUserId)
      .select('displayName avatarUrl isOnline lastSeen nativeLang learningLangs')
      .lean<IUser>();

    if (!targetUser) throw new ConversationNotFoundError(targetUserId);

    const sorted = [requesterId, targetUserId].map(id => new Types.ObjectId(id)).sort((a, b) => a.toString().localeCompare(b.toString()));

    const conv = (await ConversationModel.findOneAndUpdate(
      { participantIds: { $all: sorted, $size: 2 } },
      { $setOnInsert: { participantIds: sorted, isMutualFriends: false } },
      { upsert: true, new: true, lean: true },
    )) as IConversation;

    const redis = getRedisService();
    await Promise.all([
      redis.invalidateProfile(convListKey(requesterId)).catch(() => null),
      redis.invalidateProfile(convListKey(targetUserId)).catch(() => null),
    ]);

    return toConversationDto(conv, targetUser);
  }

  async softDeleteConversation(convId: string, userId: string): Promise<void> {
    const conv = await ConversationModel.findById(convId).lean<IConversation>();
    if (!conv) throw new ConversationNotFoundError(convId);

    const isParticipant = conv.participantIds.some(id => id.toString() === userId);
    if (!isParticipant) throw new UnauthorizedConversationError(userId, convId);

    await ConversationModel.updateOne({ _id: new Types.ObjectId(convId) }, { $pull: { participantIds: new Types.ObjectId(userId) } });

    await getRedisService()
      .invalidateProfile(convListKey(userId))
      .catch(() => null);
  }

  async getMessages(input: GetMessagesInput): Promise<PagedMessages> {
    const { convId, requesterId, limit = 50, beforeMsgId } = input;

    const group = await GroupConversationModel.findById(convId).select('members').lean();

    if (group) {
      const isMember = group.members.some(m => m.userId.toString() === requesterId);
      if (!isMember) throw new UnauthorizedConversationError(requesterId, convId);
    } else {
      const conv = await ConversationModel.findById(convId).lean<IConversation>();
      if (!conv) throw new ConversationNotFoundError(convId);

      const isParticipant = conv.participantIds.some(id => id.toString() === requesterId);
      if (!isParticipant) throw new UnauthorizedConversationError(requesterId, convId);
    }

    try {
      return await this.repo.getMessages(convId, limit, beforeMsgId);
    } catch (err) {
      if (err instanceof CassandraError) throw new CassandraReadError('getMessages', err);
      throw err;
    }
  }

  async saveMessage(data: { convId: string; senderId: string; content: string; contentType: string; mediaUrl?: string | null }): Promise<MessageDto> {
    const conv = await ConversationModel.findById(data.convId).lean<IConversation>();
    if (!conv) throw new ConversationNotFoundError(data.convId);

    const isParticipant = conv.participantIds.some(id => id.toString() === data.senderId);
    if (!isParticipant) throw new UnauthorizedConversationError(data.senderId, data.convId);

    let saved: MessageDto;
    try {
      saved = await this.repo.saveMessage({
        convId: data.convId,
        senderId: data.senderId,
        content: data.content,
        contentType: data.contentType as MessageDto['contentType'],
        mediaUrl: data.mediaUrl ?? null,
      });
    } catch (err) {
      if (err instanceof CassandraError) throw new CassandraWriteError('saveMessage', err);
      throw err;
    }

    ConversationModel.updateOne(
      { _id: new Types.ObjectId(data.convId) },
      {
        $set: {
          lastMessage: {
            text: data.content.slice(0, 200),
            senderId: new Types.ObjectId(data.senderId),
            timestamp: saved.createdAt,
          },
        },
      },
    ).catch(err => logger.warn(`[ChatService] lastMessage update failed: ${(err as Error).message}`));

    const redis = getRedisService();
    conv.participantIds.forEach(id => {
      redis.invalidateProfile(convListKey(id.toString())).catch(() => null);
    });

    return saved;
  }

  async updateMessageStatus(convId: string, msgId: string, status: MessageStatus): Promise<void> {
    try {
      await this.repo.updateMessageStatus({ convId, msgId, status });
    } catch (err) {
      if (err instanceof CassandraError) throw new CassandraWriteError('updateMessageStatus', err);
      throw err;
    }
  }

  async saveToOfflineQueue(userId: string, message: MessageDto): Promise<void> {
    const { types } = await import('cassandra-driver');

    try {
      await this.repo.addToOfflineQueue({
        userId,
        message: {
          conv_id: types.Uuid.fromString(message.convId),
          msg_id: types.TimeUuid.fromString(message.msgId),
          sender_id: types.Uuid.fromString(message.senderId),
          content: message.content,
          content_type: message.contentType,
          media_url: message.mediaUrl,
          status: message.status,
          translations: new Map(Object.entries(message.translations)),
          is_encrypted: message.isEncrypted,
          created_at: message.createdAt,
        },
      });
    } catch (err) {
      if (err instanceof CassandraError) throw new CassandraWriteError('saveToOfflineQueue', err);
      throw err;
    }
  }

  async getAndFlushOfflineQueue(userId: string): Promise<MessageDto[]> {
    let queued;
    try {
      queued = await this.repo.getOfflineQueue(userId);
    } catch (err) {
      if (err instanceof CassandraError) throw new CassandraReadError('getOfflineQueue', err);
      throw err;
    }

    const messages: MessageDto[] = [];

    for (const item of queued) {
      try {
        const msg = JSON.parse(item.payload) as MessageDto;
        messages.push(msg);
        await this.repo.deleteFromOfflineQueue(userId, item.msgId);
      } catch {
        await this.repo.deleteFromOfflineQueue(userId, item.msgId).catch(() => null);
      }
    }

    return messages;
  }
}
