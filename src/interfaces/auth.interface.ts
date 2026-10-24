import type { Request } from 'express';
import type { IUser } from '@interfaces/users.interface';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RequestWithUser extends Request {
  user?: Record<string, any>;
}

export interface DataStoredInToken {
  _id: string;
}

export interface TokenData {
  token: string;
  expiresIn: number;
}

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

export interface AppleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Omit<IUser, 'passwordHash'>;
}

export interface OAuthResult extends AuthResult {
  isNewUser: boolean;
}
