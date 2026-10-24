import { Router } from 'express';

import { FindPartnersDto, SavePreferencesDto } from '@dtos/matching.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { findPartners, getSuggestions, savePreferences } from '@controllers/matching.controller';

export class MatchingRoute implements Routes {
  public path = '/matching';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    this.router.post(`${this.path}/find`, validationMiddleware(FindPartnersDto, 'body'), findPartners);

    this.router.get(`${this.path}/suggestions`, getSuggestions);

    this.router.post(`${this.path}/preferences`, validationMiddleware(SavePreferencesDto, 'body'), savePreferences);
  }
}
