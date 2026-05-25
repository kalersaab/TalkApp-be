import { Schema, model, type Document, type Types } from 'mongoose';

export interface IMatchPreference extends Document {
  userId: Types.ObjectId;
  genderPreference: 'male' | 'female' | 'any';
  learningLanguages: string[];
  nativeLanguage: string;
  ageRange: { min: number; max: number };
  enableNearby: boolean;
  proximityKm: number;
  proficiencyLevel: string;
  updatedAt: Date;
}

const matchPreferenceSchema = new Schema<IMatchPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    genderPreference: { type: String, enum: ['male', 'female', 'any'], default: 'any' },
    learningLanguages: { type: [String], default: [] },
    nativeLanguage: { type: String, required: true },
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 100 },
    },
    enableNearby: { type: Boolean, default: false },
    proximityKm: { type: Number, default: 50 },
    proficiencyLevel: { type: String, default: 'any' },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

matchPreferenceSchema.index({ userId: 1 }, { unique: true });

export const MatchPreferenceModel = model<IMatchPreference>('MatchPreference', matchPreferenceSchema);
