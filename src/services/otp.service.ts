import { getRedisService } from '@databases/redis';
import { HttpException } from '@exceptions/HttpException';
import { logger } from '@utils/logger';
import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const MAX_OTP_ATTEMPTS = 10; // Max failed verification attempts
const OTP_ATTEMPT_WINDOW_SECONDS = 60 * 60; // 1 hour
const OTP_REQUEST_LIMIT = 20; // Max OTP requests
const OTP_REQUEST_WINDOW_SECONDS = 60 * 60; // 1 hour

// ─── Redis Key Constants ───────────────────────────────────────────────────────
const KEYS = {
  OTP: (email: string) => `otp:${email.toLowerCase()}`,
  OTP_ATTEMPTS: (email: string) => `otp:attempts:${email.toLowerCase()}`,
  OTP_REQUESTS: (email: string) => `otp:requests:${email.toLowerCase()}`,
  BLOCKED: (email: string) => `otp:blocked:${email.toLowerCase()}`,
};

// ─── Helper Functions ──────────────────────────────────────────────────────────
function generateOTP(): string {
  const buffer = crypto.randomBytes(3);
  const randomNum = buffer.readUIntBE(0, 3) % 1000000;
  return randomNum.toString().padStart(OTP_LENGTH, '0');
}

function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function compareOTP(plainOTP: string, hashedOTP: string): boolean {
  // ⚡ FIX: Use crypto.timingSafeEqual to prevent timing attacks over the network
  const a = Buffer.from(hashOTP(plainOTP));
  const b = Buffer.from(hashedOTP);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── OTP Service ──────────────────────────────────────────────────────────────
export class OTPService {
  private redis = getRedisService();

  private getRedisClient() {
    return this.redis.getDataClient();
  }

  /**
   * Generate and store OTP in Redis with security checks
   */
  async generateAndStoreOTP(email: string): Promise<string> {
    const lowerEmail = email.toLowerCase();
    const blockedKey = KEYS.BLOCKED(lowerEmail);
    const requestsKey = KEYS.OTP_REQUESTS(lowerEmail);
    const otpKey = KEYS.OTP(lowerEmail);
    const client = this.getRedisClient();

    try {
      // 1. Check if email is temporarily blocked
      const isBlocked = await client.get(blockedKey);
      if (isBlocked) {
        logger.warn(`[OTP] Blocked email attempted to request OTP: ${lowerEmail}`);
        throw new HttpException(429, 'Too many failed attempts. Please try again later.');
      }

      // 2. Rate limit OTP requests
      const requestCount = await client.incr(requestsKey);

      if (requestCount === 1) {
        await client.expire(requestsKey, OTP_REQUEST_WINDOW_SECONDS);
      }

      if (requestCount > OTP_REQUEST_LIMIT) {
        logger.warn(`[OTP] Rate limit exceeded for ${lowerEmail}: ${requestCount} requests`);
        throw new HttpException(429, 'Too many OTP requests. Please try again later.');
      }

      // 3. Generate OTP
      const otp = generateOTP();
      const hashedOTP = hashOTP(otp);

      // 4. Store hashed OTP and clean up temporary failed attempt histories in a single transaction pipeline
      const pipeline = client.pipeline();
      pipeline.set(otpKey, hashedOTP, 'EX', OTP_EXPIRY_SECONDS);
      pipeline.del(KEYS.OTP_ATTEMPTS(lowerEmail));
      await pipeline.exec();

      logger.info(`[OTP] Generated OTP for ${lowerEmail}`);
      return otp;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      logger.error(`[OTP] Failed to generate OTP for ${lowerEmail}: ${err}`);
      throw new HttpException(500, 'Failed to generate OTP. Please try again.');
    }
  }

  /**
   * Verify OTP with security checks
   */
  async verifyOTP(email: string, otp: string): Promise<boolean> {
    const lowerEmail = email.toLowerCase();
    const otpKey = KEYS.OTP(lowerEmail);
    const attemptsKey = KEYS.OTP_ATTEMPTS(lowerEmail);
    const blockedKey = KEYS.BLOCKED(lowerEmail);
    const client = this.getRedisClient();

    try {
      // 1. Check if email is blocked
      const isBlocked = await client.get(blockedKey);
      if (isBlocked) {
        logger.warn(`[OTP] Blocked email attempted verification: ${lowerEmail}`);
        throw new HttpException(429, 'Account temporarily blocked. Try again later.');
      }

      // 2. Retrieve stored hashed OTP
      const hashedOTP = await client.get(otpKey);
      if (!hashedOTP) {
        logger.warn(`[OTP] OTP expired or not found for ${lowerEmail}`);
        throw new HttpException(400, 'OTP has expired. Please request a new one.');
      }

      // 3. Compare OTPs
      const isValid = compareOTP(otp, hashedOTP);

      if (!isValid) {
        const attempts = await client.incr(attemptsKey);

        if (attempts === 1) {
          await client.expire(attemptsKey, OTP_ATTEMPT_WINDOW_SECONDS);
        }

        if (attempts >= MAX_OTP_ATTEMPTS) {
          await client.set(blockedKey, '1', 'EX', 60 * 60); // Block for 1 hour
          logger.warn(`[OTP] Too many failed attempts for ${lowerEmail}. Account blocked.`);
          throw new HttpException(429, 'Too many failed attempts. Please try again in 1 hour.');
        }

        const remaining = MAX_OTP_ATTEMPTS - attempts;
        throw new HttpException(400, `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      }

      // 4. ⚡ FIX: Clear ALL keys related to this cycle session upon successful validation verification match
      const pipeline = client.pipeline();
      pipeline.del(otpKey);
      pipeline.del(attemptsKey);
      pipeline.del(KEYS.OTP_REQUESTS(lowerEmail));
      await pipeline.exec();

      logger.info(`[OTP] OTP verified successfully for ${lowerEmail}`);
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      logger.error(`[OTP] Error verifying OTP for ${lowerEmail}: ${err}`);
      throw new HttpException(500, 'OTP verification failed. Please try again.');
    }
  }

  // ... keeping your remaining utility accessors (getRemainingAttempts, isBlocked, etc.) unchanged
}

// ─── Singleton ────────────────────────────────────────────────────────────────
let instance: OTPService | null = null;

export function getOTPService(): OTPService {
  if (!instance) instance = new OTPService();
  return instance;
}
