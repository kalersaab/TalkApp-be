import { Schema, model, Types } from 'mongoose';

export interface IUserProfile {
  userId: Types.ObjectId;

  interests: string[];
  hobbies: string[];

  placesToGo: string[];
  hometown: string | null;
  currentLocation: {
    city: string | null;
    country: string | null;
    showInProfile: boolean;
  };

  occupation: string[];

  birthday: Date | null;
  zodiacSign: string | null;

  mbtiType: string | null;

  showRegionInProfile: boolean;

  profilePictures: {
    url: string;
    isPrimary: boolean;
    uploadedAt: Date;
  }[];

  isComplete: boolean;
  completionPercentage: number;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userProfileSchema = new Schema<IUserProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 8,
        message: 'Maximum 8 interests allowed',
      },
    },

    placesToGo: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 6,
        message: 'Maximum 6 places to go allowed',
      },
    },
    hometown: {
      type: String,
      trim: true,
    },
    currentLocation: {
      city: { type: String, trim: true },
      country: { type: String, trim: true },
      showInProfile: { type: Boolean, default: true },
    },

    occupation: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 3,
        message: 'Maximum 3 occupations allowed',
      },
    },

    birthday: {
      type: Date,
      validate: {
        validator: function (v: Date) {
          if (!v) return true;
          const today = new Date();
          const age = today.getFullYear() - v.getFullYear();
          return age >= 13 && age <= 120;
        },
        message: 'Birthday must indicate age between 13 and 120',
      },
    },
    zodiacSign: {
      type: String,
      enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
    },

    mbtiType: {
      type: String,
      enum: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'],
    },

    showRegionInProfile: {
      type: Boolean,
      default: true,
    },

    profilePictures: [
      {
        url: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    isComplete: {
      type: Boolean,
      default: false,
    },
    completionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userProfileSchema.pre('save', function () {
  if (this.birthday && !this.zodiacSign) {
    this.zodiacSign = calculateZodiacSign(this.birthday);
  }

  this.completionPercentage = calculateCompletionPercentage(this);
  this.isComplete = this.completionPercentage >= 80;

  this.lastUpdatedAt = new Date();
});

function calculateZodiacSign(birthday: Date): string {
  const month = birthday.getMonth() + 1;
  const day = birthday.getDate();

  if ((month == 3 && day >= 21) || (month == 4 && day <= 19)) return 'aries';
  if ((month == 4 && day >= 20) || (month == 5 && day <= 20)) return 'taurus';
  if ((month == 5 && day >= 21) || (month == 6 && day <= 20)) return 'gemini';
  if ((month == 6 && day >= 21) || (month == 7 && day <= 22)) return 'cancer';
  if ((month == 7 && day >= 23) || (month == 8 && day <= 22)) return 'leo';
  if ((month == 8 && day >= 23) || (month == 9 && day <= 22)) return 'virgo';
  if ((month == 9 && day >= 23) || (month == 10 && day <= 22)) return 'libra';
  if ((month == 10 && day >= 23) || (month == 11 && day <= 21)) return 'scorpio';
  if ((month == 11 && day >= 22) || (month == 12 && day <= 21)) return 'sagittarius';
  if ((month == 12 && day >= 22) || (month == 1 && day <= 19)) return 'capricorn';
  if ((month == 1 && day >= 20) || (month == 2 && day <= 18)) return 'aquarius';
  return 'pisces';
}

function calculateCompletionPercentage(profile: any): number {
  let filledFields = 0;
  const totalFields = 15;

  if (profile.interests?.length > 0) filledFields++;

  if (profile.placesToGo?.length > 0) filledFields++;
  if (profile.hometown) filledFields++;
  if (profile.occupation?.length > 0) filledFields++;

  if (profile.birthday) filledFields++;
  if (profile.mbtiType) filledFields++;
  if (profile.profilePictures?.length > 0) filledFields++;
  if (profile.currentLocation?.city) filledFields++;
  if (profile.currentLocation?.country) filledFields++;

  return Math.round((filledFields / totalFields) * 100);
}

userProfileSchema.index({ userId: 1 }, { unique: true });

userProfileSchema.index({ interests: 1 });
userProfileSchema.index({ 'currentLocation.country': 1 });

userProfileSchema.index({ mbtiType: 1 });
userProfileSchema.index({ isComplete: 1 });
userProfileSchema.index({ completionPercentage: -1 });
userProfileSchema.index({ updatedAt: -1 });

export const UserProfileModel = model<IUserProfile>('UserProfile', userProfileSchema);
export default UserProfileModel;
