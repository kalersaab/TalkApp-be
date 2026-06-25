import { Schema, model, type Document, type Types } from 'mongoose';

export interface IMatchEvent extends Document {
  userId: Types.ObjectId;
  partnerId: Types.ObjectId;
  score: number;
  source: 'geo' | 'language' | 'vector' | 'combined';
  createdAt: Date;
}

const matchEventSchema = new Schema<IMatchEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, default: 0 },
    source: { type: String, enum: ['geo', 'language', 'vector', 'combined'], default: 'combined' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

matchEventSchema.index({ userId: 1, createdAt: -1 });
matchEventSchema.index({ partnerId: 1 });

export const MatchEventModel = model<IMatchEvent>('MatchEvent', matchEventSchema);
