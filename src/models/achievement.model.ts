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

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound unique — a user can only earn each achievement type once
achievementSchema.index({ userId: 1, achievementType: 1 }, { unique: true });
achievementSchema.index({ userId: 1, earnedAt: -1 }); // user achievement history
achievementSchema.index({ medalTier: 1 });             // leaderboard by tier

export const AchievementModel = model<IAchievement>('Achievement', achievementSchema);
export default AchievementModel;
