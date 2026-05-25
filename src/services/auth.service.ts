import { hash, compare } from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';

import { GOOGLE_CLIENT_ID, APPLE_APP_BUNDLE_ID } from '@config';
import { RegisterDto, LoginDto } from '@dtos/auth.dto';
import { HttpException } from '@exceptions/HttpException';
import type {
  AuthResult,
  OAuthResult,
  GoogleTokenPayload,
  AppleTokenPayload,
} from '@interfaces/auth.interface';
import type { IUser } from '@interfaces/users.interface';
import { UserModel } from '@models/users.model';
import { StreakModel } from '@models/streak.model';
import { InventoryModel } from '@models/inventory.model';
import { RefreshTokenModel } from '@models/refreshToken.model';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  generateFamily,
  refreshTokenExpiry,
} from '@utils/jwt';
import { logger } from '@utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/api/auth',
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

async function issueTokenPair(
  userId: string,
  email: string,
  family?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ userId, email });
  const rawRefresh = generateRefreshToken();
  const tokenFamily = family ?? generateFamily();

  await RefreshTokenModel.create({
    userId,
    tokenHash: hashToken(rawRefresh),
    family: tokenFamily,
    expiresAt: refreshTokenExpiry(),
  });

  return { accessToken, refreshToken: rawRefresh };
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

  // ── register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await UserModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) throw new HttpException(409, 'An account with this email already exists');

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    const user = await UserModel.create({
      displayName: dto.displayName,
      email: dto.email.toLowerCase(),
      passwordHash,
      provider: 'local',
      nativeLang: 'en',
      isVerified: false,
      isActive: true,
    });

    await createUserDocuments(user._id.toString());

    const { accessToken, refreshToken } = await issueTokenPair(
      user._id.toString(),
      user.email,
    );

    logger.info(`[Auth] Registered user ${user._id}`);
    return { accessToken, refreshToken, user: sanitizeUser(user) };
  }

  // ── login ────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResult> {
    // Select passwordHash explicitly (it's select:false on the schema)
    const user = await UserModel.findOne({ email: dto.email.toLowerCase() }).select(
      '+passwordHash +failedLoginAttempts +lockUntil',
    );

    if (!user) throw new HttpException(401, 'Invalid email or password');
    if (!user.isActive) throw new HttpException(403, 'Account is deactivated');

    // ── Brute-force check ────────────────────────────────────────────────────
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remaining = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(423, `Account locked. Try again in ${remaining} minute(s)`);
    }

    const passwordMatch = await compare(dto.password, user.passwordHash ?? '');

    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        update['lockUntil'] = new Date(Date.now() + LOCK_DURATION_MS);
        update['failedLoginAttempts'] = 0;
        logger.warn(`[Auth] Account ${user._id} locked after ${attempts} failed attempts`);
      }

      await UserModel.updateOne({ _id: user._id }, { $set: update });
      throw new HttpException(401, 'Invalid email or password');
    }

    // Reset failed attempts on successful login
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockUntil: null } },
    );

    // Revoke all previous refresh tokens for this user (full rotation)
    await RefreshTokenModel.deleteMany({ userId: user._id });

    const { accessToken, refreshToken } = await issueTokenPair(
      user._id.toString(),
      user.email,
    );

    logger.info(`[Auth] Login user ${user._id}`);
    return { accessToken, refreshToken, user: sanitizeUser(user) };
  }

  // ── google ───────────────────────────────────────────────────────────────────

  async googleAuth(idToken: string): Promise<OAuthResult> {
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
      user = await UserModel.create({
        displayName: payload.name ?? payload.email.split('@')[0],
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
      // Existing local account — link Google
      await UserModel.updateOne({ _id: user._id }, { $set: { googleId: payload.sub } });
    }

    await RefreshTokenModel.deleteMany({ userId: user._id });
    const { accessToken, refreshToken } = await issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Google auth user ${user._id} (new=${isNewUser})`);
    return { accessToken, refreshToken, user: sanitizeUser(user), isNewUser };
  }

  // ── apple ────────────────────────────────────────────────────────────────────

  async appleAuth(identityToken: string): Promise<OAuthResult> {
    let payload: AppleTokenPayload;

    try {
      // Decode header to get kid
      const decoded = jwt.decode(identityToken, { complete: true });
      if (!decoded || typeof decoded === 'string') throw new Error('Malformed token');

      const kid = (decoded.header as { kid?: string }).kid;
      if (!kid) throw new Error('Missing kid in token header');

      // Fetch Apple public key
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
      // Apple only sends email on first sign-in — use sub as fallback email key
      const email = payload.email?.toLowerCase() ?? `apple.${payload.sub}@privaterelay.appleid.com`;

      user = await UserModel.findOne({ email }) ?? await UserModel.create({
        displayName: email.split('@')[0],
        email,
        passwordHash: null,
        provider: 'google', // reuse provider field; 'apple' can be added to enum
        appleId: payload.sub,
        isVerified: payload.email_verified ?? false,
        isActive: true,
        nativeLang: 'en',
      });

      if (!user.appleId) {
        await UserModel.updateOne({ _id: user._id }, { $set: { appleId: payload.sub } });
      }

      await createUserDocuments(user._id.toString());
      isNewUser = true;
    }

    await RefreshTokenModel.deleteMany({ userId: user._id });
    const { accessToken, refreshToken } = await issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Apple auth user ${user._id} (new=${isNewUser})`);
    return { accessToken, refreshToken, user: sanitizeUser(user), isNewUser };
  }

  // ── refresh ──────────────────────────────────────────────────────────────────

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(rawToken);

    const stored = await RefreshTokenModel.findOne({ tokenHash });

    if (!stored) throw new HttpException(401, 'Invalid or revoked refresh token');
    if (stored.expiresAt < new Date()) {
      await RefreshTokenModel.deleteOne({ _id: stored._id });
      throw new HttpException(401, 'Refresh token expired');
    }

    // Reuse detection — if this family already has a newer token, someone
    // is replaying a stolen token. Invalidate the entire family.
    const familyCount = await RefreshTokenModel.countDocuments({ family: stored.family });
    if (familyCount > 1) {
      await RefreshTokenModel.deleteMany({ family: stored.family });
      logger.warn(`[Auth] Refresh token reuse detected for user ${stored.userId}. Family revoked.`);
      throw new HttpException(401, 'Refresh token reuse detected — please log in again');
    }

    const user = await UserModel.findById(stored.userId);
    if (!user || !user.isActive) throw new HttpException(401, 'User not found or inactive');

    // Rotate: delete old, issue new in same family
    await RefreshTokenModel.deleteOne({ _id: stored._id });
    const { accessToken, refreshToken } = await issueTokenPair(
      user._id.toString(),
      user.email,
      stored.family, // keep same family for reuse detection
    );

    logger.info(`[Auth] Rotated refresh token for user ${user._id}`);
    return { accessToken, refreshToken };
  }

  // ── logout ───────────────────────────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await RefreshTokenModel.deleteOne({ tokenHash });
  }

  // ── cookie helpers (used by controller) ──────────────────────────────────────

  static cookieOptions() {
    return COOKIE_OPTIONS;
  }

  static cookieName() {
    return REFRESH_COOKIE;
  }
}
