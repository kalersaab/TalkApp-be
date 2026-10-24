import { Schema, model } from 'mongoose';
import type { IUser } from '@interfaces/users.interface';

const userSchema = new Schema<IUser>(
  {
    displayName: { type: String, required: true },
    username: { type: String, required: true, unique: true, sparse: true, lowercase: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: false, select: false, sparse: true },
    avatarUrl: { type: String },

    provider: { type: String, enum: ['local', 'google', 'facebook', 'phone'], required: true, default: 'local' },
    googleId: { type: String, unique: true, sparse: true },
    appleId: { type: String, unique: true, sparse: true },
    facebookId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },

    nativeLang: { type: String, required: true, default: 'en' },
    learningLangs: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 5,
        message: 'A user can learn at most 5 languages',
      },
    },

    proficiencyLevels: {
      type: Map,
      of: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
      default: {},
    },

    gender: { type: String, enum: ['male', 'female', 'other'], sparse: true },
    dateOfBirth: { type: Date, sparse: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], default: undefined, sparse: true },
    },
    bio: { type: String, maxlength: 300 },

    daysJoined: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date },

    followingCount: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },

    totalMedalCount: { type: Number, default: 0 },
    collectorRank: {
      type: String,
      enum: ['junior', 'collector', 'senior', 'elite', 'legendary'],
      default: 'junior',
    },
    equippedItems: {
      avatarEffect: { type: String },
      chatBubble: { type: String },
      chatBackground: { type: String },
    },

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },

    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
userSchema.index({ location: '2dsphere' }, { sparse: true });
userSchema.index({ nativeLang: 1 });
userSchema.index({ learningLangs: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ collectorRank: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isActive: 1 });
userSchema.index({ proficiencyLevels: 1 }, { sparse: true });

export const UserModel = model<IUser>('User', userSchema);
export default UserModel;
