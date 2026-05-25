import { Schema, model } from 'mongoose';
import type { IStreak } from '@interfaces/users.interface';

const streakSchema = new Schema<IStreak>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

streakSchema.index({ userId: 1 }, { unique: true });
streakSchema.index({ currentStreak: -1 }); // streak leaderboard

export const StreakModel = model<IStreak>('Streak', streakSchema);
export default StreakModel;
