import { Router } from 'express';

import { TranslateMessageDto } from '@dtos/translation.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import { translationLimiter } from '@middlewares/rateLimiter';
import validationMiddleware from '@middlewares/validation.middleware';
import { translateMessage, getSupportedLanguages } from '@controllers/translation.controller';

export class TranslationRoute implements Routes {
  public path = '/translation';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    // POST /api/translation/translate
    this.router.post(
      `${this.path}/translate`,
      translationLimiter,
      validationMiddleware(TranslateMessageDto, 'body'),
      translateMessage,
    );

    // GET /api/translation/languages
    this.router.get(`${this.path}/languages`, getSupportedLanguages);
  }
}
