import { User } from '@/interfaces/users.interface';
import { model, Schema } from 'mongoose';
const userSchema = new Schema(
  {
    userName: {
      type: String,
      unique: true,
      sparse: true,
      trim:true,
      required: false,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      required: false,
      trim:true,
    },
    firstName: { type: String, required: false,trim:true },
    lastName: { type: String, required: false, trim:true },
    bio: { type: String, trim:true, },
    email: {
      type: String,
      required: true,
      unique: true,
      trim:true
    },
    password: {
      type: String,
      required: false,
      trim:true
    },
    name: {
      type: String,
      trim:true,
      required: false,
    },
    avatar: {
      type: String,
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'facebook', 'phone'],
      required: true,
      default: 'local',
    },
    isVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    isActive: { type: Boolean, required: true, default: true },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
  },
);
export const UserModel = model<User>('user', userSchema);