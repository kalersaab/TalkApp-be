import { Schema, model, Types } from 'mongoose';
import type { IConversation } from '@interfaces/users.interface';

const conversationSchema = new Schema<IConversation>(
  {
    participantIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (v: Types.ObjectId[]) => v.length === 2,
        message: 'A conversation must have exactly 2 participants',
      },
    },
    lastMessage: {
      text: { type: String, default: '' },
      senderId: { type: Schema.Types.ObjectId, ref: 'User' },
      timestamp: { type: Date, default: Date.now },
    },
    isMutualFriends: { type: Boolean, default: false },
  },
  { timestamps: true },
);

conversationSchema.index({ participantIds: 1 });

conversationSchema.index({ 'participantIds.0': 1, 'participantIds.1': 1 }, { unique: true, sparse: true });
conversationSchema.index({ updatedAt: -1 });

export const ConversationModel = model<IConversation>('Conversation', conversationSchema);
export default ConversationModel;
