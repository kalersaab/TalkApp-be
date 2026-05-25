import { Schema, model, type Document, type Types } from 'mongoose';

export type DevicePlatform = 'android' | 'ios';

export interface IDeviceToken extends Document {
  userId: Types.ObjectId;
  platform: DevicePlatform;
  token: string;
  updatedAt: Date;
}

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    token:    { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// One token per user per platform — upsert on this index
deviceTokenSchema.index({ userId: 1, platform: 1 }, { unique: true });
// Lookup by raw token (for invalid-token cleanup)
deviceTokenSchema.index({ token: 1 });

export const DeviceTokenModel = model<IDeviceToken>('DeviceToken', deviceTokenSchema);
