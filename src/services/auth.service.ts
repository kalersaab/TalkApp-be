import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';

import { GOOGLE_CLIENT_ID, APPLE_APP_BUNDLE_ID } from '@config';

import { HttpException } from '@exceptions/HttpException';
import type { AuthResult, OAuthResult, GoogleTokenPayload, AppleTokenPayload } from '@interfaces/auth.interface';
import type { IUser, LoginUser } from '@interfaces/users.interface';
import { UserModel } from '@models/users.model';
import { StreakModel } from '@models/streak.model';
import { InventoryModel } from '@models/inventory.model';
import { signAccessToken, generateRefreshToken, hashToken, generateFamily } from '@utils/jwt';

import { logger } from '@utils/logger';
import { getRedisService } from '@databases/redis';
import argon2 from 'argon2';

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/',
};

// ─── Apple JWKS client ────────────────────────────────────────────────────────

const appleJwks = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 min
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUser(user: IUser): Omit<IUser, 'passwordHash'> {
  const obj = user.toJSON() as Record<string, unknown>;
  delete obj['passwordHash'];
  return obj as Omit<IUser, 'passwordHash'>;
}

async function createUserDocuments(userId: string): Promise<void> {
  await Promise.all([
    StreakModel.create({
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: new Date(),
    }),
    InventoryModel.create({
      userId,
      items: [],
      equippedItems: { avatarEffectId: null, chatBubbleId: null, chatBackgroundId: null },
      collectorRank: 'junior',
      itemCount: 0,
    }),
  ]);
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export class AuthService {
  private redis = getRedisService();

  private async issueTokenPair(userId: string, email: string, family?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = generateRefreshToken();
    const tokenFamily = family ?? generateFamily();

    const [accessToken, tokenHash] = await Promise.all([
      Promise.resolve(signAccessToken({ userId, email })),
      Promise.resolve(hashToken(rawRefreshToken.trim())),
    ]);

    // Store with already-computed hash
    await this.redis.setRefreshTokenSession(tokenHash, {
      userId,
      family: tokenFamily,
      used: false,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  // ── register ────────────────────────────────────────────────────────────────

  // ── login ────────────────────────────────────────────────────────────────────

  public async login(userData: LoginUser): Promise<AuthResult> {
    const { email, password } = userData;
    if (!email || !password) throw new HttpException(400, 'Email and password required');
    const lowerEmail = email.toLowerCase();

    const findUser = await UserModel.findOne({ email: lowerEmail }, { passwordHash: 1, isVerified: 1, isActive: 1, email: 1, displayName: 1 }).select(
      '+passwordHash',
    );

    if (!findUser) {
      throw new HttpException(404, 'User not found');
    }

    if (!findUser.isVerified) {
      throw new HttpException(400, 'User is not verified. Please verify your email first.');
    }

    if (!findUser.isActive) {
      throw new HttpException(403, 'User is not active');
    }

    const isMatch = await argon2.verify(findUser.passwordHash, password);
    if (!isMatch) {
      throw new HttpException(401, 'Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(findUser._id.toString(), findUser.email);

    logger.info(`[Auth] User logged in ${findUser._id}`);
    return { accessToken, refreshToken, user: sanitizeUser(findUser) };
  }

  // ── me ───────────────────────────────────────────────────────────────────────

  //  public async getMe(
  //   user: Record<string, unknown>,
  // ): Promise<Record<string, unknown>> {
  //   return user;
  // }

  // ── google ───────────────────────────────────────────────────────────────────

  public async googleAuth(idToken: string): Promise<OAuthResult> {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpException(500, 'Google OAuth is not configured');

    const client = new OAuth2Client(clientId);
    let payload: GoogleTokenPayload;

    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload() as GoogleTokenPayload;
    } catch {
      throw new HttpException(401, 'Invalid Google ID token');
    }

    if (!payload?.email) throw new HttpException(401, 'Google token missing email');

    let user = await UserModel.findOne({
      $or: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }],
    });

    let isNewUser = false;

    if (!user) {
      const displayName = payload.name ?? payload.email.split('@')[0];
      const nameParts = displayName.trim().split(' ');
      const baseUsername = (nameParts.length > 1 ? nameParts[0] : nameParts[0].slice(0, 5)).toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-4);
      const username = `ta@${baseUsername}${timestamp}`;

      user = await UserModel.create({
        displayName,
        username,
        email: payload.email.toLowerCase(),
        passwordHash: null,
        avatarUrl: payload.picture ?? null,
        provider: 'google',
        googleId: payload.sub,
        isVerified: payload.email_verified ?? false,
        isActive: true,
        nativeLang: 'en',
      });
      await createUserDocuments(user._id.toString());
      isNewUser = true;
    } else if (!user.googleId) {
      await UserModel.updateOne({ _id: user._id }, { $set: { googleId: payload.sub } });
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Google auth user ${user._id} (new=${isNewUser})`);
    return { accessToken, refreshToken, user: sanitizeUser(user), isNewUser };
  }

  // ── apple ────────────────────────────────────────────────────────────────────

  public async appleAuth(identityToken: string): Promise<OAuthResult> {
    let payload: AppleTokenPayload;

    try {
      const decoded = jwt.decode(identityToken, { complete: true });
      if (!decoded || typeof decoded === 'string') throw new Error('Malformed token');

      const kid = (decoded.header as { kid?: string }).kid;
      if (!kid) throw new Error('Missing kid in token header');

      const key = await appleJwks.getSigningKey(kid);
      const publicKey = key.getPublicKey();

      const verified = jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        audience: APPLE_APP_BUNDLE_ID ?? undefined,
        issuer: 'https://appleid.apple.com',
      }) as AppleTokenPayload;

      payload = verified;
    } catch (err) {
      logger.warn(`[Auth] Apple token verification failed: ${(err as Error).message}`);
      throw new HttpException(401, 'Invalid Apple identity token');
    }

    if (!payload.sub) throw new HttpException(401, 'Apple token missing sub');

    let user = await UserModel.findOne({ appleId: payload.sub });
    let isNewUser = false;

    if (!user) {
      const email = payload.email?.toLowerCase() ?? `apple.${payload.sub}@privaterelay.appleid.com`;
      const displayName = email.split('@')[0];
      const nameParts = displayName.trim().split(' ');
      const baseUsername = (nameParts.length > 1 ? nameParts[0] : nameParts[0].slice(0, 5)).toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-4);
      const username = `ta@${baseUsername}${timestamp}`;

      user =
        (await UserModel.findOne({ email })) ??
        (await UserModel.create({
          displayName,
          username,
          email,
          passwordHash: null,
          provider: 'apple',
          appleId: payload.sub,
          isVerified: payload.email_verified ?? false,
          isActive: true,
          nativeLang: 'en',
        }));

      if (!user.appleId) {
        await UserModel.updateOne({ _id: user._id }, { $set: { appleId: payload.sub } });
      }

      await createUserDocuments(user._id.toString());
      isNewUser = true;
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Apple auth user ${user._id} (new=${isNewUser})`);
    return { accessToken, refreshToken, user: sanitizeUser(user), isNewUser };
  }

  // ── refresh ──────────────────────────────────────────────────────────────────

  public async refresh(rawToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = hashToken(rawToken.trim());

    // Atomic operation:
    // First request gets the token.
    // Second request gets null.
    const session = await this.redis.consumeRefreshTokenSession(tokenHash);

    if (!session) {
      throw new HttpException(401, 'Invalid or already used refresh token');
    }

    if (session.isCompromised) {
      throw new HttpException(401, 'Security warning: Session compromise detected.');
    }

    const user = await UserModel.findById(session.userId).lean();

    if (!user || !user.isActive) {
      throw new HttpException(401, 'Account is disabled or missing');
    }

    return this.issueTokenPair(user._id.toString(), user.email, session.family);
  }

  // ── logout ───────────────────────────────────────────────────────────────────

  public async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken.trim());
    await this.redis.invalidateRefreshTokenSession(tokenHash);
  }

  // ── cookie helpers (used by controller) ──────────────────────────────────────

  static cookieOptions() {
    return COOKIE_OPTIONS;
  }

  static cookieName() {
    return REFRESH_COOKIE;
  }
}
