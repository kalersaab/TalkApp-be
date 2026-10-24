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

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

followSchema.index({ followingId: 1 });

export const FollowModel = model<IFollow>('Follow', followSchema);
export default FollowModel;
