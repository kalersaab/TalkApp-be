import type { IUser } from './users.interface';

// ─── Request filter ───────────────────────────────────────────────────────────

export interface MatchFilters {
  genderPreference: 'male' | 'female' | 'any';
  learningLanguages: string[]; // languages the requester wants to learn
  nativeLanguage: string; // requester's native language
  ageRange: { min: number; max: number };
  enableNearby: boolean;
  proximityKm: number;
  proficiencyLevel: string; // 'any' | 'beginner' | 'intermediate' | 'advanced'
}

// ─── Candidate with score ─────────────────────────────────────────────────────

export interface ScoredCandidate {
  user: IUser;
  score: number;
  isMutualFollow: boolean;
}

// ─── Partner profile returned to client ──────────────────────────────────────

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

// ─── Cached result ────────────────────────────────────────────────────────────

export interface CachedMatchResult {
  partners: PartnerProfile[];
  generatedAt: string;
}
