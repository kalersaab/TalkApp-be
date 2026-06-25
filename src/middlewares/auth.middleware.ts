import type { Response, NextFunction } from 'express';

import { HttpException } from '@exceptions/HttpException';
import type { RequestWithUser } from '@interfaces/auth.interface';
import { UserModel } from '@models/users.model';
import { verifyAccessToken } from '@utils/jwt';

/**
 * Extracts the Bearer token from the Authorization header,
 * verifies the RS256 signature, and attaches the full user
 * document to req.user.
 *
 * Returns 401 for missing, expired, or invalid tokens.
 * Returns 401 if the user no longer exists or is inactive.
 */
export const AuthMiddleware = async (req: RequestWithUser, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new HttpException(401, 'Authorization header missing or malformed'));
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token); // throws HttpException on failure

    const user = await UserModel.findById(payload.userId, '-passwordHash').lean();
    if (!user) return next(new HttpException(401, 'User not found'));
    if (!user.isActive) return next(new HttpException(401, 'Account is deactivated'));

    req.user = user;
    next();
  } catch (err) {
    next(err instanceof HttpException ? err : new HttpException(401, 'Authentication failed'));
  }
};
