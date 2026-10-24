import { Router } from 'express';

import { LoginDto, GoogleAuthDto, AppleAuthDto, ForgotPasswordDto, ResetPasswordDto, SignInWithEmailDto, VerifyEmailTokenDto } from '@dtos/auth.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import { loginLimiter, refreshLimiter } from '@middlewares/rateLimiter';
import validationMiddleware from '@middlewares/validation.middleware';
import { AuthController } from '@controllers/auth.controller';

class AuthRoute implements Routes {
  public path = '/auth';
  public auth = new AuthController();
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post(`${this.path}/login`, loginLimiter, validationMiddleware(LoginDto, 'body'), this.auth.login);

    this.router.get(`${this.path}/me`, AuthMiddleware, this.auth.getMe);

    this.router.post(`${this.path}/google`, loginLimiter, validationMiddleware(GoogleAuthDto, 'body'), this.auth.googleAuth);

    this.router.post(`${this.path}/apple`, loginLimiter, validationMiddleware(AppleAuthDto, 'body'), this.auth.appleAuth);

    this.router.post(`${this.path}/signin-email`, loginLimiter, validationMiddleware(SignInWithEmailDto, 'body'), this.auth.signInWithEmail);

    this.router.post(`${this.path}/verify-email-token`, validationMiddleware(VerifyEmailTokenDto, 'body'), this.auth.verifyEmailToken);

    this.router.post(`${this.path}/refresh`, refreshLimiter, this.auth.refresh);

    this.router.post(`${this.path}/logout`, this.auth.logout);

    this.router.post(`${this.path}/forgot-password`, loginLimiter, validationMiddleware(ForgotPasswordDto, 'body'), this.auth.forgotPassword);

    this.router.post(`${this.path}/reset-password`, loginLimiter, validationMiddleware(ResetPasswordDto, 'body'), this.auth.resetPassword);
  }
}

export default AuthRoute;
