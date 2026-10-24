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

  public getMe = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      res.status(200).json({
        success: true,
        data: user,
        message: 'user data fetched successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('[AUTH] Google auth request received');
      console.log('[AUTH] Request body:', { hasIdToken: !!req.body.idToken, idTokenLength: req.body.idToken?.length });

      const { idToken }: GoogleAuthDto = req.body;
      const result = await this.svc.googleAuth(idToken);

      this.setRefreshCookie(res, result.refreshToken);

      console.log('[AUTH] Google auth successful:', { userId: result.user._id, isNewUser: result.isNewUser });

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
      console.error('[AUTH] Google auth failed:', err);
      next(err);
    }
  };

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

  public signInWithEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: string };

      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required' });
        return;
      }

      const result = await this.svc.signInWithEmail(email);

      if ('isNewUser' in result && result.isNewUser) {
        res.status(200).json({
          success: true,
          data: result,
          message: 'Email verified. Please complete your profile.',
        });
        return;
      }

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
