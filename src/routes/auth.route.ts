import { Router } from 'express';

import { LoginDto, GoogleAuthDto, AppleAuthDto, ForgotPasswordDto, ResetPasswordDto } from '@dtos/auth.dto';
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
    // POST /api/auth/login
    this.router.post(`${this.path}/login`, loginLimiter, validationMiddleware(LoginDto, 'body'), this.auth.login);

    // GET /api/auth/me
    this.router.get(`${this.path}/me`, AuthMiddleware, this.auth.getMe);

    // POST /api/auth/google
    this.router.post(`${this.path}/google`, loginLimiter, validationMiddleware(GoogleAuthDto, 'body'), this.auth.googleAuth);

    // POST /api/auth/apple
    this.router.post(`${this.path}/apple`, loginLimiter, validationMiddleware(AppleAuthDto, 'body'), this.auth.appleAuth);

    // POST /api/auth/refresh  — no AuthMiddleware, token is in cookie/body
    this.router.post(`${this.path}/refresh`, refreshLimiter, this.auth.refresh);

    // POST /api/auth/logout
    this.router.post(`${this.path}/logout`, this.auth.logout);

    // POST /api/auth/forgot-password
    this.router.post(`${this.path}/forgot-password`, loginLimiter, validationMiddleware(ForgotPasswordDto, 'body'), this.auth.forgotPassword);

    // POST /api/auth/reset-password
    this.router.post(`${this.path}/reset-password`, loginLimiter, validationMiddleware(ResetPasswordDto, 'body'), this.auth.resetPassword);
  }
}

export default AuthRoute;
