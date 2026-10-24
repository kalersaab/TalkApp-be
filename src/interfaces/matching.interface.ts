import type { IUser } from './users.interface';

export interface MatchFilters {
  genderPreference: 'male' | 'female' | 'any';
  learningLanguages: string[];
  nativeLanguage: string;
  ageRange: { min: number; max: number };
  enableNearby: boolean;
  proximityKm: number;
  proficiencyLevel: string;
}

export interface ScoredCandidate {
  user: IUser;
  score: number;
  isMutualFollow: boolean;
}

export interface PartnerProfile {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  nativeLang: string;
  learningLangs: string[];
  proficiencyLevels: Record<string, string>;
  bio: string | null;
  isOnline: boolean;
  lastSeen: Date | null;
  currentStreak: number;
  collectorRank: string;
  equippedItems: {
    avatarEffect: string | null;
    chatBubble: string | null;
    chatBackground: string | null;
  };
  score: number;
  isMutualFollow: boolean;
}

export interface CachedMatchResult {
  partners: PartnerProfile[];
  generatedAt: string;
}
