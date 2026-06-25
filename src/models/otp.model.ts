import { otp } from '@/interfaces/otp.interface';
import { model, Schema } from 'mongoose';

const otpSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      ref: 'User',
    },
    otp: {
      type: String,
      required: true,
    },
    otpExpires: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

export const OtpModel = model<otp>('otp', otpSchema);
