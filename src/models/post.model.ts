import { Schema, model } from 'mongoose';
import type { IPost } from '@interfaces/users.interface';

const postSchema = new Schema<IPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    mediaUrl: { type: String, default: null },
    postType: { type: String, enum: ['text', 'image', 'voice'], required: true, default: 'text' },
    likeCount: { type: Number, default: 0 },
    // Storing likedBy as an array works well up to ~thousands of likes per post.
    // For viral posts at scale, move to a separate likes collection.
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

postSchema.index({ userId: 1 });
postSchema.index({ createdAt: -1 }); // global feed pagination
postSchema.index({ userId: 1, createdAt: -1 }); // user profile feed
postSchema.index({ likedBy: 1 }, { sparse: true }); // "posts liked by user"

export const PostModel = model<IPost>('Post', postSchema);
export default PostModel;
