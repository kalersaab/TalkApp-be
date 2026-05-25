import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

import { JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY } from '@config';
import type { AccessTokenPayload } from '@interfaces/auth.interface';
import { HttpException } from '@exceptions/HttpException';

// ─── Key helpers ──────────────────────────────────────────────────────────────

function getPrivateKey(): string {
  if (!JWT_PRIVATE_KEY) throw new Error('JWT_PRIVATE_KEY is not set. Run: npm run gen:keys');
  return Buffer.from(JWT_PRIVATE_KEY, 'base64').toString('utf8');
}

function getPublicKey(): string {
  if (!JWT_PUBLIC_KEY) throw new Error('JWT_PUBLIC_KEY is not set. Run: npm run gen:keys');
  return Buffer.from(JWT_PUBLIC_KEY, 'base64').toString('utf8');
}

// ─── Access token ─────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: (JWT_ACCESS_EXPIRY ?? '15m') as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new HttpException(401, 'Access token expired');
    throw new HttpException(401, 'Invalid access token');
  }
}

// ─── Refresh token ────────────────────────────────────────────────────────────

/** Generates a cryptographically random opaque refresh token string */
export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

/** SHA-256 hash of the raw token — this is what we store in MongoDB */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Generates a random family ID for refresh token rotation chains */
export function generateFamily(): string {
  return randomBytes(16).toString('hex');
}

/** Returns the Date when a refresh token expires */
export function refreshTokenExpiry(): Date {
  const expiry = JWT_REFRESH_EXPIRY ?? '30d';
  const days = parseInt(expiry.replace('d', ''), 10) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
