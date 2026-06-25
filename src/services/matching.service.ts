import { Types } from 'mongoose';

import { UserModel } from '@models/users.model';
import { FollowModel } from '@models/follow.model';
import { MatchPreferenceModel } from '@models/matchPreference.model';
import { MatchEventModel } from '@models/matchEvent.model';
import { getRedisService } from '@databases/redis';
import { getUserVector, isQdrantAvailable } from '@databases/qdrant';
import type { MatchFilters, ScoredCandidate, PartnerProfile, CachedMatchResult } from '@interfaces/matching.interface';
import type { IUser } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MATCH_CACHE_TTL = 5 * 60; // 5 minutes
const SUGGEST_CACHE_TTL = 30 * 60; // 30 minutes
const CANDIDATE_LIMIT = 50;
const RESULT_LIMIT = 20;
const TIMEZONE_WINDOW_H = 3; // ±3 hours UTC offset

const NS = 'talkapp';
const matchKey = (userId: string) => `${NS}:match:${userId}`;
const suggestKey = (userId: string) => `${NS}:suggest:${userId}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Estimate UTC offset (hours) from longitude — rough but no API needed */
function longitudeToUtcOffset(lng: number): number {
  return Math.round(lng / 15);
}

function toPartnerProfile(sc: ScoredCandidate): PartnerProfile {
  const u = sc.user;
  return {
    _id: u._id.toString(),
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    nativeLang: u.nativeLang,
    learningLangs: u.learningLangs,
    proficiencyLevels: u.proficiencyLevels ? Object.fromEntries(u.proficiencyLevels.entries()) : {},
    bio: u.bio,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    currentStreak: u.currentStreak,
    collectorRank: u.collectorRank,
    equippedItems: {
      avatarEffect: u.equippedItems?.avatarEffect ?? null,
      chatBubble: u.equippedItems?.chatBubble ?? null,
      chatBackground: u.equippedItems?.chatBackground ?? null,
    },
    score: sc.score,
    isMutualFollow: sc.isMutualFollow,
  };
}

// ─── MatchingService ──────────────────────────────────────────────────────────

export class MatchingService {
  // ── buildMongoQuery ──────────────────────────────────────────────────────────

  buildMongoQuery(
    requestingUserId: string,
    filters: MatchFilters,
    requesterLocation: [number, number] | null,
    requesterUtcOffset: number,
  ): Record<string, unknown> {
    const query: Record<string, unknown> = {
      // STEP 1 — core language exchange match
      _id: { $ne: new Types.ObjectId(requestingUserId) },
      isActive: true,
      isOnline: true,
      nativeLang: { $in: filters.learningLanguages },
      learningLangs: { $in: [filters.nativeLanguage] },
    };

    // Proficiency filter — only apply when a specific level is requested
    if (filters.proficiencyLevel && filters.proficiencyLevel !== 'any') {
      // proficiencyLevels is a Map<langCode, level>; query each target lang
      const proficiencyConditions = filters.learningLanguages.map(lang => ({
        [`proficiencyLevels.${lang}`]: filters.proficiencyLevel,
      }));
      if (proficiencyConditions.length === 1) {
        Object.assign(query, proficiencyConditions[0]);
      } else {
        query['$or'] = proficiencyConditions;
      }
    }

    // STEP 2 — gender filter
    if (filters.genderPreference !== 'any') {
      query['gender'] = filters.genderPreference;
    }

    // STEP 3 — age filter (convert ageRange to birthdate range)
    const now = new Date();
    const maxBirthdate = new Date(now.getFullYear() - filters.ageRange.min, now.getMonth(), now.getDate());
    const minBirthdate = new Date(now.getFullYear() - filters.ageRange.max, now.getMonth(), now.getDate());
    query['dateOfBirth'] = { $gte: minBirthdate, $lte: maxBirthdate };

    // STEP 4 — geo filter
    if (filters.enableNearby && requesterLocation) {
      query['location'] = {
        $near: {
          $geometry: { type: 'Point', coordinates: requesterLocation },
          $maxDistance: filters.proximityKm * 1000,
        },
      };
    }

    // STEP 5 — timezone filter (±3 hours UTC offset from longitude)
    const minOffset = requesterUtcOffset - TIMEZONE_WINDOW_H;
    const maxOffset = requesterUtcOffset + TIMEZONE_WINDOW_H;
    // Convert offset range back to longitude range
    query['location.coordinates.0'] = {
      $gte: minOffset * 15,
      $lte: maxOffset * 15,
    };

    return query;
  }

  // ── rankCandidates ───────────────────────────────────────────────────────────

  async rankCandidates(candidates: IUser[], requestingUserId: string): Promise<ScoredCandidate[]> {
    // Fetch mutual follow set in one query
    const candidateIds = candidates.map(c => c._id);
    const mutualFollows = await FollowModel.find({
      followerId: new Types.ObjectId(requestingUserId),
      followingId: { $in: candidateIds },
      isMutual: true,
    }).lean();
    const mutualSet = new Set(mutualFollows.map(f => f.followingId.toString()));

    // Try vector ranking
    const qdrantOk = await isQdrantAvailable();
    let requesterVec: number[] | null = null;
    if (qdrantOk) {
      requesterVec = await getUserVector(requestingUserId);
    }

    const scored: ScoredCandidate[] = await Promise.all(
      candidates.map(async user => {
        const isMutualFollow = mutualSet.has(user._id.toString());

        // Base score: 1.0
        let score = 1.0;

        // Vector similarity boost (0–1 range, weighted 0.6)
        if (requesterVec) {
          const candidateVec = await getUserVector(user._id.toString());
          if (candidateVec && candidateVec.length === requesterVec.length) {
            score += cosineSimilarity(requesterVec, candidateVec) * 0.6;
          }
        }

        // Mutual follow boost
        if (isMutualFollow) score += 0.3;

        // Online boost
        if (user.isOnline) score += 0.1;

        // Streak boost (normalised, max 0.1)
        score += Math.min(user.currentStreak / 100, 0.1);

        return { user, score, isMutualFollow };
      }),
    );

    return scored.sort((a, b) => b.score - a.score);
  }

  // ── cacheResults ─────────────────────────────────────────────────────────────

  async cacheResults(userId: string, results: PartnerProfile[]): Promise<void> {
    const redis = getRedisService();
    const payload: CachedMatchResult = {
      partners: results,
      generatedAt: new Date().toISOString(),
    };
    try {
      await redis.cacheProfile(matchKey(userId), payload as unknown as Record<string, unknown>, MATCH_CACHE_TTL);
    } catch (err) {
      logger.warn(`[MatchingService] cacheResults failed: ${(err as Error).message}`);
    }
  }

  async getCachedResults(userId: string): Promise<CachedMatchResult | null> {
    try {
      const raw = await getRedisService().getProfile(matchKey(userId));
      return raw ? (raw as unknown as CachedMatchResult) : null;
    } catch {
      return null;
    }
  }

  async cacheSuggestions(userId: string, results: PartnerProfile[]): Promise<void> {
    const redis = getRedisService();
    const payload: CachedMatchResult = {
      partners: results,
      generatedAt: new Date().toISOString(),
    };
    try {
      await redis.cacheProfile(suggestKey(userId), payload as unknown as Record<string, unknown>, SUGGEST_CACHE_TTL);
    } catch (err) {
      logger.warn(`[MatchingService] cacheSuggestions failed: ${(err as Error).message}`);
    }
  }

  async getCachedSuggestions(userId: string): Promise<CachedMatchResult | null> {
    try {
      const raw = await getRedisService().getProfile(suggestKey(userId));
      return raw ? (raw as unknown as CachedMatchResult) : null;
    } catch {
      return null;
    }
  }

  // ── trackMatchEvent ──────────────────────────────────────────────────────────

  async trackMatchEvent(userId: string, partnerId: string, score = 0): Promise<void> {
    try {
      await MatchEventModel.create({
        userId: new Types.ObjectId(userId),
        partnerId: new Types.ObjectId(partnerId),
        score,
        source: 'combined',
      });
    } catch (err) {
      // Analytics failure must never break the main flow
      logger.warn(`[MatchingService] trackMatchEvent failed: ${(err as Error).message}`);
    }
  }

  // ── findPartners — orchestrates all 8 steps ──────────────────────────────────

  async findPartners(requestingUserId: string, filters: MatchFilters): Promise<PartnerProfile[]> {
    // Load requester to get location
    const requester = await UserModel.findById(requestingUserId).select('location').lean<IUser>();

    const coords = requester?.location?.coordinates ?? null;
    const utcOffset = coords ? longitudeToUtcOffset(coords[0]) : 0;

    // STEPS 1–5: build query
    const mongoQuery = this.buildMongoQuery(requestingUserId, filters, coords, utcOffset);

    // STEP 6: execute MongoDB query
    let candidates: IUser[];
    try {
      candidates = await UserModel.find(mongoQuery)
        .select(
          'displayName avatarUrl nativeLang learningLangs proficiencyLevels bio ' +
            'isOnline lastSeen currentStreak collectorRank equippedItems location gender dateOfBirth',
        )
        .limit(CANDIDATE_LIMIT)
        .lean<IUser[]>();
    } catch (err) {
      logger.error(`[MatchingService] MongoDB query failed: ${(err as Error).message}`);
      candidates = [];
    }

    if (!candidates.length) return [];

    // STEPS 7: vector similarity ranking
    const ranked = await this.rankCandidates(candidates, requestingUserId);

    // STEP 8: top 20
    const top = ranked.slice(0, RESULT_LIMIT).map(toPartnerProfile);

    // Cache and track (non-blocking)
    void this.cacheResults(requestingUserId, top);
    void Promise.all(top.map(p => this.trackMatchEvent(requestingUserId, p._id, p.score)));

    return top;
  }

  // ── savePreferences ──────────────────────────────────────────────────────────

  async savePreferences(userId: string, filters: MatchFilters): Promise<void> {
    await MatchPreferenceModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          ...filters,
          userId: new Types.ObjectId(userId),
        },
      },
      { upsert: true, new: true },
    );
    // Bust suggestion cache so next GET /suggestions re-runs with new prefs
    await getRedisService()
      .invalidateProfile(suggestKey(userId))
      .catch(() => null);
  }

  async getPreferences(userId: string) {
    return MatchPreferenceModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
  }

  // ── getSuggestions — uses saved preferences ───────────────────────────────────

  async getSuggestions(userId: string): Promise<PartnerProfile[]> {
    // Return cached suggestions if fresh (< 30 min)
    const cached = await this.getCachedSuggestions(userId);
    if (cached) return cached.partners;

    const prefs = await this.getPreferences(userId);
    if (!prefs) return [];

    const filters: MatchFilters = {
      genderPreference: prefs.genderPreference,
      learningLanguages: prefs.learningLanguages,
      nativeLanguage: prefs.nativeLanguage,
      ageRange: prefs.ageRange,
      enableNearby: prefs.enableNearby,
      proximityKm: prefs.proximityKm,
      proficiencyLevel: prefs.proficiencyLevel,
    };

    const results = await this.findPartners(userId, filters);
    await this.cacheSuggestions(userId, results);
    return results;
  }
}
