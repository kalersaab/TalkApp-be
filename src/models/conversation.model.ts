import { Schema, model, Types } from 'mongoose';
import type { IConversation } from '@interfaces/users.interface';

const conversationSchema = new Schema<IConversation>(
  {
    // Always exactly 2 participants for a DM
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

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound index — the primary lookup: "find conversation between user A and user B"
conversationSchema.index({ participantIds: 1 });
// Unique pair — prevents duplicate conversations between the same two users
conversationSchema.index({ 'participantIds.0': 1, 'participantIds.1': 1 }, { unique: true, sparse: true });
conversationSchema.index({ updatedAt: -1 }); // sort by most recent activity

export const ConversationModel = model<IConversation>('Conversation', conversationSchema);
export default ConversationModel;
