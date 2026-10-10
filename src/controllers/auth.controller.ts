import type { Request, Response, NextFunction } from 'express';

import { LoginDto, GoogleAuthDto, AppleAuthDto, SignInWithEmailDto, VerifyEmailTokenDto } from '@dtos/auth.dto';
import type { RequestWithUser } from '@interfaces/auth.interface';
import { AuthService } from '@services/auth.service';

export class AuthController {
  private svc: AuthService;

  constructor() {
    this.svc = new AuthService();
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(AuthService.cookieName(), refreshToken, AuthService.cookieOptions());
  }

  // ─── POST /api/auth/login ─────────────────────────────────────────────────────

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userData: LoginDto = req.body;
      const result = await this.svc.login(userData);

      this.setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        },
        message: 'user logged in successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── GET /api/auth/me ─────────────────────────────────────────────────────────

  public getMe = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      // const userData = await this.svc.getMe(user);
      res.status(200).json({
        success: true,
        data: user,
        message: 'user data fetched successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/google ────────────────────────────────────────────────────

  public googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken }: GoogleAuthDto = req.body;
      const result = await this.svc.googleAuth(idToken);

      this.setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          isNewUser: result.isNewUser,
        },
      });
      
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/apple ─────────────────────────────────────────────────────

  public appleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityToken }: AppleAuthDto = req.body;
      const result = await this.svc.appleAuth(identityToken);

      this.setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          isNewUser: result.isNewUser,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/refresh ───────────────────────────────────────────────────

  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken: string | undefined =
        (req.body as { refreshToken?: string }).refreshToken ?? (req.cookies as Record<string, string>)[AuthService.cookieName()];

      if (!rawToken) {
        res.status(401).json({ success: false, message: 'Refresh token missing' });
        return;
      }

      const { accessToken, refreshToken } = await this.svc.refresh(rawToken);

      this.setRefreshCookie(res, refreshToken);

      res.status(200).json({
        success: true,
        data: { accessToken, refreshToken },
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/logout ────────────────────────────────────────────────────

  public logout = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken: string | undefined =
        (req.cookies as Record<string, string>)[AuthService.cookieName()] ?? (req.body as { refreshToken?: string }).refreshToken;

      if (rawToken) await this.svc.logout(rawToken);

      res.clearCookie(AuthService.cookieName(), { path: AuthService.cookieOptions().path });
      res.status(200).json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/forgot-password ───────────────────────────────────────────

  public forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      const result = await this.svc.forgotPassword(email);

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/reset-password ────────────────────────────────────────────

  public resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp, newPassword } = req.body as { email?: string; otp?: string; newPassword?: string };

      if (!email || !otp || !newPassword) {
        res.status(400).json({ success: false, message: 'Email, OTP, and new password are required' });
        return;
      }

      const result = await this.svc.resetPassword(email, otp, newPassword);

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/signin-email ──────────────────────────────────────────────

  public signInWithEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      const result = await this.svc.signInWithEmail(email);

      // For new users, don't set cookie
      if ('isNewUser' in result && result.isNewUser) {
        res.status(200).json({
          success: true,
          data: result,
          message: 'Email verified. Please complete your profile.',
        });
        return;
      }

      // For existing users, set refresh token cookie
      if ('refreshToken' in result) {
        this.setRefreshCookie(res, result.refreshToken);
      }

      res.status(200).json({
        success: true,
        data: result,
        message: 'Sign-in successful',
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── POST /api/auth/verify-email-token ────────────────────────────────────────

  public verifyEmailToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body as { token?: string };

      if (!token) {
        res.status(400).json({ success: false, message: 'Token is required' });
        return;
      }

      const result = await this.svc.verifyEmailToken(token);

      this.setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          isNewUser: result.isNewUser,
        },
        message: 'Email verified successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}