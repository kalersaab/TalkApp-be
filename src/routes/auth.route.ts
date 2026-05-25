import { Router } from 'express';

import { RegisterDto, LoginDto, GoogleAuthDto, AppleAuthDto } from '@dtos/auth.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import { registerLimiter, loginLimiter, refreshLimiter } from '@middlewares/rateLimiter';
import validationMiddleware from '@middlewares/validation.middleware';
import {
  register,
  login,
  googleAuth,
  appleAuth,
  refresh,
  logout,
} from '@controllers/auth.controller';

class AuthRoute implements Routes {
  public path = '/auth';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // POST /api/auth/register
    this.router.post(
      `${this.path}/register`,
      registerLimiter,
      validationMiddleware(RegisterDto, 'body'),
      register,
    );

    // POST /api/auth/login
    this.router.post(
      `${this.path}/login`,
      loginLimiter,
      validationMiddleware(LoginDto, 'body'),
      login,
    );

    // POST /api/auth/google
    this.router.post(
      `${this.path}/google`,
      loginLimiter,
      validationMiddleware(GoogleAuthDto, 'body'),
      googleAuth,
    );

    // POST /api/auth/apple
    this.router.post(
      `${this.path}/apple`,
      loginLimiter,
      validationMiddleware(AppleAuthDto, 'body'),
      appleAuth,
    );

    // POST /api/auth/refresh  — no AuthMiddleware, token is in cookie/body
    this.router.post(
      `${this.path}/refresh`,
      refreshLimiter,
      refresh,
    );

    // POST /api/auth/logout
    this.router.post(
      `${this.path}/logout`,
      AuthMiddleware,
      logout,
    );
  }
}

export default AuthRoute;
