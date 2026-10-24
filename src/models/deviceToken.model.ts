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
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    token: { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

deviceTokenSchema.index({ userId: 1, platform: 1 }, { unique: true });

deviceTokenSchema.index({ token: 1 });

export const DeviceTokenModel = model<IDeviceToken>('DeviceToken', deviceTokenSchema);
