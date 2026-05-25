import type { Request, Response, NextFunction } from 'express';

import { RegisterDto, LoginDto, GoogleAuthDto, AppleAuthDto } from '@dtos/auth.dto';
import type { RequestWithUser } from '@interfaces/auth.interface';
import { AuthService } from '@services/auth.service';
import validationMiddleware from '@middlewares/validation.middleware';

const svc = new AuthService();

// ─── POST /api/auth/register ──────────────────────────────────────────────────

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: RegisterDto = req.body;
    const result = await svc.register(dto);

    res.cookie(AuthService.cookieName(), result.refreshToken, AuthService.cookieOptions());

    res.status(201).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: LoginDto = req.body;
    const result = await svc.login(dto);

    res.cookie(AuthService.cookieName(), result.refreshToken, AuthService.cookieOptions());

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/google ────────────────────────────────────────────────────

export const googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { idToken }: GoogleAuthDto = req.body;
    const result = await svc.googleAuth(idToken);

    res.cookie(AuthService.cookieName(), result.refreshToken, AuthService.cookieOptions());

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/apple ─────────────────────────────────────────────────────

export const appleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { identityToken }: AppleAuthDto = req.body;
    const result = await svc.appleAuth(identityToken);

    res.cookie(AuthService.cookieName(), result.refreshToken, AuthService.cookieOptions());

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Accept from httpOnly cookie (preferred) or body (mobile fallback)
    const rawToken: string | undefined =
      (req.cookies as Record<string, string>)[AuthService.cookieName()] ??
      (req.body as { refreshToken?: string }).refreshToken;

    if (!rawToken) {
      res.status(401).json({ message: 'Refresh token missing' });
      return;
    }

    const { accessToken, refreshToken } = await svc.refresh(rawToken);

    // Rotate cookie
    res.cookie(AuthService.cookieName(), refreshToken, AuthService.cookieOptions());

    res.status(200).json({ accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export const logout = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken: string | undefined =
      (req.cookies as Record<string, string>)[AuthService.cookieName()] ??
      (req.body as { refreshToken?: string }).refreshToken;

    if (rawToken) await svc.logout(rawToken);

    res.clearCookie(AuthService.cookieName(), { path: '/api/auth' });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Legacy class export — keeps existing server.ts import working ────────────

class AuthController {
  public signUp  = register;
  public logIn   = login;
  public logOut  = logout;
}

export default AuthController;
