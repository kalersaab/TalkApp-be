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

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

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
      cacheMaxAge: 10 * 60 * 1000,
    });
  }
  return appleJwks;
}

export const bootstrapGoogleAuth = async (): Promise<void> => {
  try {
    const client = getGoogleClient();

    await client.getFederatedSignonCertsAsync();

    logger.info('[Auth] Google OAuth certificates pre-cached successfully');
  } catch (err) {
    logger.warn(`[Auth] Failed to pre-cache Google certificates: ${(err as Error).message}`);
  }
};

export const bootstrapAppleAuth = async (): Promise<void> => {
  try {
    getAppleJwks();

    logger.info('[Auth] Apple OAuth JWKS client initialized (keys will be cached on first use)');
  } catch (err) {
    logger.warn(`[Auth] Failed to initialize Apple JWKS client: ${(err as Error).message}`);
  }
};

export const bootstrapAuthProviders = async (): Promise<void> => {
  await Promise.allSettled([bootstrapGoogleAuth(), bootstrapAppleAuth()]);
  logger.info('[Auth] OAuth provider bootstrap completed');
};

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

    await this.redis.setRefreshTokenSession(tokenHash, {
      userId,
      family: tokenFamily,
      used: false,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

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

  public async googleAuth(idToken: string): Promise<OAuthResult> {
    if (!idToken) throw new HttpException(400, 'ID Token is required');

    const tokenHash = hashToken(idToken);
    const cachedPayload = await this.redis.getDataClient().get(`google_token:${tokenHash}`);

    let payload: GoogleTokenPayload;
    let existingUser: any = null;

    if (cachedPayload) {
      payload = JSON.parse(cachedPayload) as GoogleTokenPayload;

      existingUser = await UserModel.findOne({
        $or: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }],
      }).exec();
    } else {
      let unverifiedPayload: any;
      try {
        unverifiedPayload = jwt.decode(idToken) as any;
      } catch {
        throw new HttpException(401, 'Malformed token');
      }

      if (!unverifiedPayload?.email) throw new HttpException(401, 'Token missing email');

      const targetEmail = unverifiedPayload.email.toLowerCase();
      const googleId = unverifiedPayload.sub;

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

      await this.redis.getDataClient().setex(`google_token:${tokenHash}`, 20 * 60, JSON.stringify(payload));
    }

    const targetEmail = payload.email.toLowerCase();
    const googleId = payload.sub;
    const isGoogleVerified = payload.email_verified ?? false;

    let isNewUser = false;
    let user: any;

    if (!existingUser) {
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

      createUserDocuments(newUser._id.toString()).catch(err => {
        logger.error(`[Auth] Failed to create docs: ${(err as Error).message}`);
      });
    } else {
      const updates: Record<string, any> = {};

      if (!existingUser.googleId) {
        updates.googleId = googleId;
      }

      if (!existingUser.isVerified && isGoogleVerified) {
        updates.isVerified = true;
      }

      if (Object.keys(updates).length > 0) {
        user = await UserModel.findByIdAndUpdate(existingUser._id, { $set: updates }, { new: true });
      } else {
        user = existingUser;
      }
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

    logger.info(`[Auth] Google auth ${user._id} (new=${isNewUser}) (cached=${!!cachedPayload})`);
    return {
      accessToken,
      refreshToken,
      user: user,
      isNewUser,
    };
  }

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

      createUserDocuments(newUser._id.toString()).catch(err => {
        logger.error(`[Auth] Failed to create docs: ${(err as Error).message}`);
      });
    } else {
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

  public async refresh(rawToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = hashToken(rawToken.trim());

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

  public async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken.trim());
    await this.redis.invalidateRefreshTokenSession(tokenHash);
  }

  public async signInWithEmail(email: string): Promise<OAuthResult | { isNewUser: boolean; email: string; message: string }> {
    if (!email) throw new HttpException(400, 'Email is required');

    const lowerEmail = email.toLowerCase();
    const existingUser = await UserModel.findOne({ email: lowerEmail }).lean().exec();

    if (!existingUser) {
      logger.info(`[Auth] New user sign-in attempt with email ${lowerEmail}`);
      return {
        isNewUser: true,
        email: lowerEmail,
        message: 'Please complete your profile',
      };
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(existingUser._id.toString(), existingUser.email);

    logger.info(`[Auth] User signed in with email ${existingUser._id}`);
    return {
      accessToken,
      refreshToken,
      user: sanitizeUser(existingUser as any),
      isNewUser: false,
    };
  }

  public async verifyEmailToken(
    token: string,
  ): Promise<{ user: Omit<IUser, 'passwordHash'>; accessToken: string; refreshToken: string; isNewUser: boolean }> {
    if (!token) throw new HttpException(400, 'Token is required');

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;

      const { email, userId, isNew } = decoded;

      if (!email) throw new HttpException(401, 'Invalid token: missing email');

      const lowerEmail = email.toLowerCase();

      if (isNew) {
        const baseUsername = lowerEmail.split('@')[0].slice(0, 10);
        const username = `ta@${baseUsername}${Math.floor(10000 + Math.random() * 90000)}`;

        const newUser = await UserModel.create({
          displayName: baseUsername,
          username,
          email: lowerEmail,
          passwordHash: null,
          provider: 'email',
          isVerified: true,
          isActive: true,
          nativeLang: 'en',
          learningLangs: [],
          proficiencyLevels: {},
          location: { type: 'Point', coordinates: [0, 0] },
        });

        createUserDocuments(newUser._id.toString()).catch(err => {
          logger.error(`[Auth] Failed to create docs: ${(err as Error).message}`);
        });

        const { accessToken, refreshToken } = await this.issueTokenPair(newUser._id.toString(), newUser.email);

        logger.info(`[Auth] New user created via email verification ${newUser._id}`);
        return {
          user: sanitizeUser(newUser as any),
          accessToken,
          refreshToken,
          isNewUser: true,
        };
      }

      const user = await UserModel.findOne({ email: lowerEmail }).lean().exec();

      if (!user) {
        throw new HttpException(404, 'User not found');
      }

      if (!user.isActive) {
        throw new HttpException(403, 'User is not active');
      }

      const { accessToken, refreshToken } = await this.issueTokenPair(user._id.toString(), user.email);

      logger.info(`[Auth] User verified via email token ${user._id}`);
      return {
        user: sanitizeUser(user as any),
        accessToken,
        refreshToken,
        isNewUser: false,
      };
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }

      logger.warn(`[Auth] Email token verification failed: ${(err as Error).message}`);
      throw new HttpException(401, 'Invalid or expired token');
    }
  }

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

      await sendEmail([email], 'Password Reset OTP - TalkApp', emailHtml, []);

      logger.info(`[Auth] Password reset OTP sent to ${email}`);
    } catch (err) {
      logger.error(`[Auth] Failed to send password reset OTP: ${(err as Error).message}`);
      throw err;
    }
  }

  public async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const lowerEmail = email.toLowerCase();

    if (!email || !otp || !newPassword) {
      throw new HttpException(400, 'Email, OTP, and new password are required');
    }

    try {
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

      const hashedPasswordPromise = argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 2,
      });

      const invalidateUserTokensPromise = this.redis.invalidateUserRefreshTokens(userId);

      const [hashedPassword] = await Promise.all([hashedPasswordPromise, invalidateUserTokensPromise]);

      await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: hashedPassword } });

      logger.info(`[Auth] Password reset successfully for ${lowerEmail}`);

      return {
        message: 'Password reset successfully. Please login with your new password',
      };
    } catch (err) {
      logger.error(`[Auth] Password reset failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Password reset failed. Please try again.');
    }
  }

  static cookieOptions() {
    return COOKIE_OPTIONS;
  }

  static cookieName() {
    return REFRESH_COOKIE;
  }
}
