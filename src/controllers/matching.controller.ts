import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { MatchingService } from '@services/matching.service';
import type { FindPartnersDto } from '@dtos/matching.dto';
import type { MatchFilters } from '@interfaces/matching.interface';

const svc = new MatchingService();

function dtoToFilters(dto: FindPartnersDto): MatchFilters {
  return {
    genderPreference: dto.genderPreference,
    learningLanguages: dto.learningLanguages.map(l => l.toLowerCase()),
    nativeLanguage: dto.nativeLanguage.toLowerCase(),
    ageRange: dto.ageRange,
    enableNearby: dto.enableNearby,
    proximityKm: dto.proximityKm ?? 50,
    proficiencyLevel: dto.proficiencyLevel,
  };
}

// ─── POST /api/matching/find ──────────────────────────────────────────────────

export const findPartners = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = dtoToFilters(req.body as FindPartnersDto);
    const partners = await svc.findPartners(req.user._id.toString(), filters);
    res.json({ success: true, data: { partners, count: partners.length } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/matching/suggestions ───────────────────────────────────────────

export const getSuggestions = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const partners = await svc.getSuggestions(req.user._id.toString());
    res.json({ success: true, data: { partners, count: partners.length } });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/matching/preferences ──────────────────────────────────────────

export const savePreferences = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = dtoToFilters(req.body as FindPartnersDto);
    await svc.savePreferences(req.user._id.toString(), filters);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
