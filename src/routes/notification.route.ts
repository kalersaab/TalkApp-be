import { Router } from 'express';

import { SaveDeviceTokenDto, UpdateNotificationPreferencesDto } from '@dtos/notification.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { saveToken, updatePreferences } from '@controllers/notification.controller';

export class NotificationRoute implements Routes {
  public path = '/notifications';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    // POST /api/notifications/token
    this.router.post(`${this.path}/token`, validationMiddleware(SaveDeviceTokenDto, 'body'), saveToken);

    // POST /api/notifications/preferences
    this.router.post(`${this.path}/preferences`, validationMiddleware(UpdateNotificationPreferencesDto, 'body', true), updatePreferences);
  }
}
