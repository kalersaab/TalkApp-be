import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { TranslationService } from '@services/translation.service';
import type { TranslateMessageDto } from '@dtos/translation.dto';

const svc = new TranslationService();

// ─── POST /api/translation/translate ─────────────────────────────────────────

export const translateMessage = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { convId, msgId, targetLang } = req.body as TranslateMessageDto;
    const result = await svc.translateMessage(
      req.user._id.toString(),
      convId,
      msgId,
      targetLang,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/translation/languages ──────────────────────────────────────────

export const getSupportedLanguages = async (
  _req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const languages = await svc.getSupportedLanguages();
    res.json({ success: true, data: languages });
  } catch (err) {
    next(err);
  }
};
