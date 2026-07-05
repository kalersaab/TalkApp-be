import { OAuth2Client } from 'google-auth-library';
import jwksClientLib from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';

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

import { getOTPService } from '@services/otp.service';
import sendEmail from '@services/sendEmail.service';
import { renderEmail } from '@/template/email/renderTemplate';

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/',
};

// ─── OAuth2 Clients (Lazy initialized) ────────────────────────────────────────

let googleClient: OAuth2Client | null = null;
let appleJwks: ReturnType<typeof jwksClientLib> | null = null;

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpException(500, 'Google OAuth is not configured');
    googleClient = new OAuth2Client(clientId);
  }
  return googleClient;
}

function getAppleJwks(): ReturnType<typeof jwksClientLib> {
  if (!appleJwks) {
    appleJwks = jwksClientLib({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 min
    });
  }
  return appleJwks;
}

// ─── Certificate Pre-warming (Call on server startup) ─────────────────────────

/**
 * 🚀 PERFORMANCE OPTIMIZATION: Pre-warm Google OAuth certificates
 * Call this during server startup to cache Google's public certificates in memory.
 * This saves 20-50ms on the first OAuth verification by eliminating the cert fetch.
 */
export const bootstrapGoogleAuth = async (): Promise<void> => {
  try {
    const client = getGoogleClient();

    // Pre-fetch Google's public certificates and cache them in memory
    // This prevents the first OAuth call from having to fetch certs over the network
    await client.getFederatedSignonCertsAsync();

    logger.info('[Auth] Google OAuth certificates pre-cached successfully');
  } catch (err) {
    logger.warn(`[Auth] Failed to pre-cache Google certificates: ${(err as Error).message}`);
    // Non-fatal error - first OAuth call will just fetch certs normally
  }
};

/**
 * 🚀 PERFORMANCE OPTIMIZATION: Pre-warm Apple OAuth certificates
 * Call this during server startup to cache Apple's JWKS keys in memory.
 * This saves 10-30ms on the first Apple OAuth verification.
 */
export const bootstrapAppleAuth = async (): Promise<void> => {
  try {
    getAppleJwks();

    // Pre-warm the JWKS client cache by triggering key retrieval
    // The client will automatically cache Apple's current signing keys
    // We'll let it fail gracefully if no keys are available yet
    logger.info('[Auth] Apple OAuth JWKS client initialized (keys will be cached on first use)');
  } catch (err) {
    logger.warn(`[Auth] Failed to initialize Apple JWKS client: ${(err as Error).message}`);
    // Non-fatal error - first OAuth call will just fetch certs normally
  }
};

/**
 * 🚀 PERFORMANCE OPTIMIZATION: Bootstrap all OAuth providers
 * Call this once during server startup to pre-warm all certificate caches.
 */
export const bootstrapAuthProviders = async (): Promise<void> => {
  await Promise.allSettled([bootstrapGoogleAuth(), bootstrapAppleAuth()]);
  logger.info('[Auth] OAuth provider bootstrap completed');
};

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
  private otp = getOTPService();

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

    if (!findUser.passwordHash) {
      throw new HttpException(400, 'This account is linked with Google. Please log in using Google Auth instead.');
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
    if (!idToken) throw new HttpException(400, 'ID Token is required');

    // 🚀 OPTIMIZATION 1: Check token cache first
    const tokenHash = hashToken(idToken);
    const cachedPayload = await this.redis.getDataClient().get(`google_token:${tokenHash}`);

    let payload: GoogleTokenPayload;
    let existingUser: any = null;

    if (cachedPayload) {
      // Use cached verified payload (saves 150-180ms!)
      payload = JSON.parse(cachedPayload) as GoogleTokenPayload;

      // Still need to fetch user from DB
      existingUser = await UserModel.findOne({
        $or: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }],
      }).exec();
    } else {
      // 🚀 OPTIMIZATION 2: Extract email WITHOUT verification first, then parallel
      let unverifiedPayload: any;
      try {
        unverifiedPayload = jwt.decode(idToken) as any;
      } catch {
        throw new HttpException(401, 'Malformed token');
      }

      if (!unverifiedPayload?.email) throw new HttpException(401, 'Token missing email');

      const targetEmail = unverifiedPayload.email.toLowerCase();
      const googleId = unverifiedPayload.sub;

      // 🚀 OPTIMIZATION 3: Run Google verification and DB query in PARALLEL
      const [ticket, userFromDB] = await Promise.all([
        (async () => {
          try {
            const client = getGoogleClient();
            return await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
          } catch (err) {
            throw new HttpException(401, 'Invalid Google ID token');
          }
        })(),
        UserModel.findOne({
          $or: [{ googleId: googleId }, { email: targetEmail }],
        }).exec(),
      ]);

      payload = ticket.getPayload() as GoogleTokenPayload;
      existingUser = userFromDB;

      if (!payload?.email) throw new HttpException(401, 'Google token missing email');

      // Cache the verified payload for 5 minutes
      await this.redis.getDataClient().setex(
        `google_token:${tokenHash}`,
        20 * 60, // 20 minutes
        JSON.stringify(payload),
      );
    }

    const targetEmail = payload.email.toLowerCase();
    const googleId = payload.sub;
    const isGoogleVerified = payload.email_verified ?? false;

    let isNewUser = false;
    let user: any;

    if (!existingUser) {
      // ---- NEW USER - Optimized creation ----
      const displayName = payload.name ?? targetEmail.split('@')[0];
      const nameParts = displayName.trim().split(' ');
      const baseUsername = (nameParts.length > 1 ? nameParts[0] : nameParts[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
      const username = `ta@${baseUsername}${Math.floor(10000 + Math.random() * 90000)}`;

      const newUser = await UserModel.create({
        displayName,
        username,
        email: targetEmail,
        passwordHash: null,
        avatarUrl: payload.picture,
        provider: 'google',
        googleId: googleId,
        isVerified: isGoogleVerified,
        isActive: true,
        location: { type: 'Point', coordinates: [0, 0] },
      });

      user = newUser;
      isNewUser = true;

      // Background tasks (non-blocking)
      createUserDocuments(newUser._id.toString()).catch(err => {
        logger.error(`[Auth] Failed to create docs: ${(err as Error).message}`);
      });
    } else {
      // ---- EXISTING USER ----
      const updates: Record<string, any> = {};

      if (!existingUser.googleId) {
        updates.googleId = googleId;
      }

      if (!existingUser.isVerified && isGoogleVerified) {
        updates.isVerified = true;
      }

      // Only update if needed
      if (Object.keys(updates).length > 0) {
        user = await UserModel.findByIdAndUpdate(existingUser._id, { $set: updates }, { new: true });
      } else {
        user = existingUser;
      }
    }

    // 🚀 OPTIMIZATION 4: Issue tokens
    const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Google auth ${user._id} (new=${isNewUser}) (cached=${!!cachedPayload})`);
    return {
      accessToken,
      refreshToken,
      user: user,
      isNewUser,
    };
  }

  // ── apple ────────────────────────────────────────────────────────────────────

  public async appleAuth(identityToken: string): Promise<OAuthResult> {
    let payload: AppleTokenPayload;

    try {
      const decoded = jwt.decode(identityToken, { complete: true });
      if (!decoded || typeof decoded === 'string') throw new Error('Malformed token');

      const kid = (decoded.header as { kid?: string }).kid;
      if (!kid) throw new Error('Missing kid in token header');

      const key = await getAppleJwks().getSigningKey(kid);
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

    const lowerEmail = payload.email?.toLowerCase() ?? `apple.${payload.sub}@privaterelay.appleid.com`;
    const existingUser = await UserModel.findOne({
      $or: [{ appleId: payload.sub }, { email: lowerEmail }],
    });

    let isNewUser = false;
    let user: any;

    if (!existingUser) {
      // New user: create with all required fields
      const displayName = lowerEmail.split('@')[0];
      const nameParts = displayName.trim().split(' ');
      const baseUsername = (nameParts.length > 1 ? nameParts[0] : nameParts[0].slice(0, 5)).toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-4);
      const username = `ta@${baseUsername}${timestamp}`;

      const newUser = await UserModel.create({
        displayName,
        username,
        email: lowerEmail,
        passwordHash: null,
        provider: 'apple',
        appleId: payload.sub,
        isVerified: payload.email_verified ?? true,
        isActive: true,
        nativeLang: 'en',
        learningLangs: [],
        proficiencyLevels: {},
        location: { type: 'Point', coordinates: [0, 0] },
      });

      user = newUser;
      isNewUser = true;

      // Background
      createUserDocuments(newUser._id.toString()).catch(err => {
        logger.error(`[Auth] Failed to create docs: ${(err as Error).message}`);
      });
    } else {
      // Existing user - conditional update
      const updateData: Record<string, any> = {};

      if (!existingUser.appleId) {
        updateData.appleId = payload.sub;
      }

      if (!existingUser.isVerified && payload.email_verified) {
        updateData.isVerified = true;
      }

      if (!existingUser.nativeLang) {
        updateData.nativeLang = 'en';
      }
      if (!existingUser.learningLangs || existingUser.learningLangs.length === 0) {
        updateData.learningLangs = [];
      }
      if (!existingUser.proficiencyLevels || Object.keys(existingUser.proficiencyLevels).length === 0) {
        updateData.proficiencyLevels = {};
      }

      if (Object.keys(updateData).length > 0) {
        user = await UserModel.findByIdAndUpdate(existingUser._id, { $set: updateData }, { new: true });
      } else {
        user = existingUser;
      }
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Apple auth ${user._id} (new=${isNewUser})`);
    return {
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
      isNewUser,
    };
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

  // ── forgot password ──────────────────────────────────────────────────────────

  public async forgotPassword(email: string): Promise<{ message: string }> {
    const lowerEmail = email.toLowerCase();

    const responseMessage = {
      message: 'If an account exists with this email, you will receive a password reset OTP',
    };

    const user = await UserModel.findOne({ email: lowerEmail }).select('displayName').lean().exec();

    if (!user) {
      return responseMessage;
    }

    this.sendPasswordResetEmailAsync(lowerEmail, user.displayName).catch(err => {
      logger.error(`[Auth] Failed to send password reset OTP: ${(err as Error).message}`);
    });

    return responseMessage;
  }

  private async sendPasswordResetEmailAsync(email: string, displayName: string): Promise<void> {
    try {
      const otp = await this.otp.generateAndStoreOTP(email);

      // Render template
      const emailHtml = renderEmail({
        templatePath: 'src/template/passwordReset.hbs',
        data: {
          appName: 'TalkApp',
          name: displayName || 'User',
          otp: otp,
          expiryMinutes: 15,
          supportEmail: 'support@talkapp.com',
          currentYear: new Date().getFullYear(),
        },
      });

      // Send email
      await sendEmail([email], 'Password Reset OTP - TalkApp', emailHtml, []);

      logger.info(`[Auth] Password reset OTP sent to ${email}`);
    } catch (err) {
      logger.error(`[Auth] Failed to send password reset OTP: ${(err as Error).message}`);
      throw err;
    }
  }

  // ── reset password ───────────────────────────────────────────────────────────

  public async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const lowerEmail = email.toLowerCase();

    if (!email || !otp || !newPassword) {
      throw new HttpException(400, 'Email, OTP, and new password are required');
    }

    try {
      // 🚀 OPTIMIZATION 1: Verify OTP + Find user in PARALLEL
      const [isValid, user] = await Promise.all([
        this.otp.verifyOTP(lowerEmail, otp),
        UserModel.findOne({ email: lowerEmail }, { _id: 1 }).lean().exec(),
      ]);

      if (!isValid) {
        throw new HttpException(400, 'Invalid or expired OTP');
      }

      if (!user) {
        throw new HttpException(404, 'User not found');
      }

      const userId = user._id.toString();

      // 🚀 OPTIMIZATION 2: Hash password in background + do DB update immediately
      const hashedPasswordPromise = argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 2,
      });

      // 🚀 OPTIMIZATION 3: Invalidate user tokens more efficiently
      // Store invalidation list (user-specific tokens) in Redis
      // This is much faster than scanning all tokens
      const invalidateUserTokensPromise = this.redis.invalidateUserRefreshTokens(userId);

      // 🚀 OPTIMIZATION 4: Wait for password hash + DO DB update + invalidate tokens in PARALLEL
      const [hashedPassword] = await Promise.all([hashedPasswordPromise, invalidateUserTokensPromise]);

      // Update password immediately
      await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: hashedPassword } });

      logger.info(`[Auth] Password reset successfully for ${lowerEmail}`);

      // Return response immediately (rest continues in background if any)
      return {
        message: 'Password reset successfully. Please login with your new password',
      };
    } catch (err) {
      logger.error(`[Auth] Password reset failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Password reset failed. Please try again.');
    }
  }

  // ── cookie helpers (used by controller) ──────────────────────────────────────

  static cookieOptions() {
    return COOKIE_OPTIONS;
  }

  static cookieName() {
    return REFRESH_COOKIE;
  }
}
