import { Schema, model } from 'mongoose';
import type { IUser } from '@interfaces/users.interface';

const userSchema = new Schema<IUser>(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: null, select: false },
    avatarUrl: { type: String, default: null },

    // Auth
    provider: { type: String, enum: ['local', 'google', 'facebook', 'phone'], required: true, default: 'local' },
    googleId: { type: String, default: null, sparse: true },
    appleId:  { type: String, default: null, sparse: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // Language learning
    nativeLang: { type: String, required: true, default: 'en' },
    learningLangs: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 5,
        message: 'A user can learn at most 5 languages',
      },
    },
    // Map<langCode, level>
    proficiencyLevels: {
      type: Map,
      of: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
      default: {},
    },

    // Profile
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    dateOfBirth: { type: Date, default: null },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    bio: { type: String, default: null, maxlength: 300 },

    // Activity
    daysJoined: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date, default: null },

    // Social counts (denormalised for fast reads)
    followingCount: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },

    // Gamification
    totalMedalCount: { type: Number, default: 0 },
    collectorRank: {
      type: String,
      enum: ['junior', 'collector', 'senior', 'elite', 'legendary'],
      default: 'junior',
    },
    equippedItems: {
      avatarEffect: { type: String, default: null },
      chatBubble: { type: String, default: null },
      chatBackground: { type: String, default: null },
    },

    // Presence
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },

    // Brute-force protection
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Omit passwordHash from all JSON responses by default
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ location: '2dsphere' }, { sparse: true }); // geo queries
userSchema.index({ nativeLang: 1 });
userSchema.index({ learningLangs: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ collectorRank: 1 });
userSchema.index({ createdAt: -1 });

export const UserModel = model<IUser>('User', userSchema);
export default UserModel;
