import { Schema, model, type Document, type Types } from 'mongoose';
import type { DevicePlatform } from './deviceToken.model';

export type NotificationType = 'message' | 'follow' | 'achievement' | 'post_like';
export type NotificationStatus = 'sent' | 'failed' | 'invalid_token';

export interface INotificationLog extends Document {
  userId: Types.ObjectId;
  platform: DevicePlatform;
  type: NotificationType;
  status: NotificationStatus;
  errorMessage: string | null;
  attempt: number;
  createdAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    type: { type: String, enum: ['message', 'follow', 'achievement', 'post_like'], required: true },
    status: { type: String, enum: ['sent', 'failed', 'invalid_token'], required: true },
    errorMessage: { type: String, default: null },
    attempt: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationLogSchema.index({ userId: 1, createdAt: -1 });
notificationLogSchema.index({ status: 1, createdAt: -1 }); // for failure monitoring

export const NotificationLogModel = model<INotificationLog>('NotificationLog', notificationLogSchema);
