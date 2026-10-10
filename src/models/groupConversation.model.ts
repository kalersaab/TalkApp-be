import { Schema, model, Types } from 'mongoose';
import type { IGroupConversation, IGroupMember } from '@interfaces/chat.interface';

const groupMemberSchema = new Schema<IGroupMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupConversationSchema = new Schema<IGroupConversation>(
  {
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    avatarUrl: { type: String },
    members: {
      type: [groupMemberSchema],
      required: true,
      validate: {
        validator: (v: IGroupMember[]) => v.length >= 2 && v.length <= 256,
        message: 'A group must have between 2 and 256 members',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: {
      text: { type: String, default: '' },
      senderId: { type: Schema.Types.ObjectId, ref: 'User' },
      timestamp: { type: Date, default: Date.now },
    },
    settings: {
      onlyAdminsCanPost: { type: Boolean, default: false },
      approvalRequired: { type: Boolean, default: false },
      isPrivate: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Find all groups a user is part of
groupConversationSchema.index({ 'members.userId': 1, updatedAt: -1 });
// Sort by most recent activity
groupConversationSchema.index({ updatedAt: -1 });
// Text search on group name
groupConversationSchema.index({ name: 'text', description: 'text' });

export const GroupConversationModel = model<IGroupConversation>('GroupConversation', groupConversationSchema);
export default GroupConversationModel;
