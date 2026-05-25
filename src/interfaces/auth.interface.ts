import type { Request } from 'express';
import type { IUser } from '@interfaces/users.interface';

// ─── JWT payload ──────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// ─── Token pair returned to clients ──────────────────────────────────────────

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Express request augmentation ────────────────────────────────────────────

export interface RequestWithUser extends Request {
  user: IUser;
}

// ─── Legacy — kept so existing code compiles without changes ─────────────────

export interface DataStoredInToken {
  _id: string;
}

export interface TokenData {
  token: string;
  expiresIn: number;
}

// ─── OAuth payloads ───────────────────────────────────────────────────────────

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

export interface AppleTokenPayload {
  sub: string;          // Apple user ID — stable across sessions
  email?: string;       // only present on first sign-in
  email_verified?: boolean;
}

// ─── Auth service return types ────────────────────────────────────────────────

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Omit<IUser, 'passwordHash'>;
}

export interface OAuthResult extends AuthResult {
  isNewUser: boolean;
}
