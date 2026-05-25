import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { NotificationService } from '@services/notification.service';
import type { SaveDeviceTokenDto, UpdateNotificationPreferencesDto } from '@dtos/notification.dto';

const svc = new NotificationService();

// ─── POST /api/notifications/token ───────────────────────────────────────────

export const saveToken = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { platform, token } = req.body as SaveDeviceTokenDto;
    await svc.saveDeviceToken(req.user._id.toString(), platform, token);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/notifications/preferences ─────────────────────────────────────

export const updatePreferences = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await svc.updatePreferences(
      req.user._id.toString(),
      req.body as UpdateNotificationPreferencesDto,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
