import { Schema, model } from 'mongoose';
import type { IAchievement } from '@interfaces/users.interface';

const achievementSchema = new Schema<IAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    achievementType: { type: String, required: true, trim: true },
    medalTier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
      required: true,
    },
    earnedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

achievementSchema.index({ userId: 1, achievementType: 1 }, { unique: true });
achievementSchema.index({ userId: 1, earnedAt: -1 });
achievementSchema.index({ medalTier: 1 });

export const AchievementModel = model<IAchievement>('Achievement', achievementSchema);
export default AchievementModel;
