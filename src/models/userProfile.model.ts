import { Schema, model, Types } from 'mongoose';

// ─── Extended Profile Model ───────────────────────────────────────────────────

export interface IUserProfile {
  userId: Types.ObjectId;

 

  // Interests & Hobbies (max 8)
  interests: string[];
  hobbies: string[];

  // Places & Location
  placesToGo: string[]; // Places they want to visit
  hometown: string | null; // Where they live
  currentLocation: {
    city: string | null;
    country: string | null;
    showInProfile: boolean; // Privacy setting
  };

  // Professional
  occupation: string[]; // Max 3 options

 
  birthday: Date | null;
  zodiacSign: string | null; // Auto-calculated from birthday

  // Psychology
  mbtiType: string | null; // 16 personality types

  // Privacy & Display
  showRegionInProfile: boolean;

  // Profile Pictures (max 4)
  profilePictures: {
    url: string;
    isPrimary: boolean;
    uploadedAt: Date;
  }[];

  // Metadata
  isComplete: boolean; // Auto-calculated based on filled fields
  completionPercentage: number; // 0-100
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
 // Interests & Hobbies
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 8,
        message: 'Maximum 8 interests allowed',
      },
    },
    // Places & Location
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

    // Professional
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
          return age >= 13 && age <= 120; // Age validation
        },
        message: 'Birthday must indicate age between 13 and 120',
      },
    },
    zodiacSign: {
      type: String,
      enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
    },

    // Psychology
    mbtiType: {
      type: String,
      enum: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'],
    },

    // Privacy & Display
    showRegionInProfile: {
      type: Boolean,
      default: true,
    },

    // Profile Pictures
    profilePictures: [
      {
        url: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Metadata
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



// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

userProfileSchema.pre('save', function () {
  // Auto-calculate zodiac sign from birthday
  if (this.birthday && !this.zodiacSign) {
    this.zodiacSign = calculateZodiacSign(this.birthday);
  }

  // Update completion percentage
  this.completionPercentage = calculateCompletionPercentage(this);
  this.isComplete = this.completionPercentage >= 80; // 80% threshold for complete

  // Update lastUpdatedAt
  this.lastUpdatedAt = new Date();
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateZodiacSign(birthday: Date): string {
  const month = birthday.getMonth() + 1; // getMonth() is 0-indexed
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
  return 'pisces'; // Feb 19 - Mar 20
}

function calculateCompletionPercentage(profile: any): number {
  let filledFields = 0;
  const totalFields = 15; // Total important fields to track

  
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

// ─── Indexes ──────────────────────────────────────────────────────────────────

userProfileSchema.index({ userId: 1 }, { unique: true });

userProfileSchema.index({ interests: 1 });
userProfileSchema.index({ 'currentLocation.country': 1 });

userProfileSchema.index({ mbtiType: 1 });
userProfileSchema.index({ isComplete: 1 });
userProfileSchema.index({ completionPercentage: -1 });
userProfileSchema.index({ updatedAt: -1 });

export const UserProfileModel = model<IUserProfile>('UserProfile', userProfileSchema);
export default UserProfileModel;
