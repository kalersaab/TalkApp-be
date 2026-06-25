import { Schema, model } from 'mongoose';
import type { IFollow } from '@interfaces/users.interface';

const followSchema = new Schema<IFollow>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isMutual: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound unique — one follow record per pair
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
// Reverse lookup — "who follows this user?"
followSchema.index({ followingId: 1 });

export const FollowModel = model<IFollow>('Follow', followSchema);
export default FollowModel;
