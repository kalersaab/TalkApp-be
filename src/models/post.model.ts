import { Schema, model } from 'mongoose';
import type { IPost } from '@interfaces/users.interface';

const postSchema = new Schema<IPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    mediaUrl: { type: String, default: null },
    postType: { type: String, enum: ['text', 'image', 'voice'], required: true, default: 'text' },
    likeCount: { type: Number, default: 0 },

    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

postSchema.index({ userId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ likedBy: 1 }, { sparse: true });

export const PostModel = model<IPost>('Post', postSchema);
export default PostModel;
