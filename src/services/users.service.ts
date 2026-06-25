import { CreateUserDto, GetUserQueryDto } from '@/dtos/users.dto';
import { HttpException } from '@exceptions/HttpException';

import { UserModel } from '@models/users.model';

import argon2 from 'argon2';

import sendEmail from './sendEmail.service';
import { renderEmail } from '@/template/email/renderTemplate';
import { getOTPService } from '@services/otp.service';
import { logger } from '@utils/logger';

export class UserService {
  private otpService = getOTPService();

  public async findUserById(userId: any) {
    const findUser = UserModel.findById(userId);
    if (!findUser) throw new HttpException(409, "User doesn't exist");

    return findUser;
  }

  public async findAllUser(query: GetUserQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const filter: any = {};

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.keyword?.trim()) {
      filter.$or = [
        {
          username: {
            $regex: query.keyword.trim(),
            $options: 'i',
          },
        },
        {
          email: {
            $regex: query.keyword.trim(),
            $options: 'i',
          },
        },
      ];
    }
    const [users, total, activeCount, inactiveCount] = await Promise.all([
      UserModel.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      UserModel.countDocuments(filter),

      UserModel.countDocuments({ isActive: true }),

      UserModel.countDocuments({ isActive: false }),
    ]);

    return {
      data: users,
      count: total,
      isActiveCount: activeCount,
      notActiveCount: inactiveCount,
    };
  }

  public async createUser(userData: CreateUserDto) {
    if (!userData) throw new HttpException(400, 'empty payload');

    const { email, passwordHash, displayName, gender, dateOfBirth, nativeLang, learningLangs, proficiencyLevels } = userData;
    const lowerEmail = email.toLowerCase();

    const [findUser, hashedPassword] = await Promise.all([
      UserModel.findOne({ email: lowerEmail }, { _id: 1 }).lean(),
      argon2.hash(passwordHash, {
        type: argon2.argon2id,
        memoryCost: 16384,
        timeCost: 2,
      }),
    ]);

    if (findUser) throw new HttpException(409, `This email ${email} already exists`);

    const nameParts = displayName.trim().split(' ');
    const baseUsername = (nameParts.length > 1 ? nameParts[0] : nameParts[0].slice(0, 5)).toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now().toString().slice(-4);
    const username = `ta@${baseUsername}${timestamp}`;

    const user = await UserModel.create({
      displayName: displayName || email.split('@')[0],
      username,
      email: lowerEmail,
      gender,
      dateOfBirth,
      passwordHash: hashedPassword,
      provider: 'local',
      nativeLang: nativeLang || 'en',
      learningLangs: learningLangs || [],
      proficiencyLevels: proficiencyLevels || {},
      isVerified: false,
      location: { coordinates: [0, 0] },
    });

    this.handleOnboardingSideEffects(lowerEmail, displayName).catch(err =>
      logger.error(`[Users] Background onboarding tasks failed for ${lowerEmail}: ${err}`),
    );

    // 5. Respond to Postman instantly!
    return user;
  }

  private async handleOnboardingSideEffects(lowerEmail: string, displayName: string): Promise<void> {
    try {
      // 1. Generate and store OTP inside Redis (Happens while user app transitions screens)
      const otp = await this.otpService.generateAndStoreOTP(lowerEmail);

      // 2. Transmit through your SMTP network gateway
      await sendEmail(
        [lowerEmail],
        `Verify Your Email for TalkApp - Your OTP Code`,
        renderEmail({
          data: {
            name: displayName || 'User',
            otp: otp,
            appName: 'TalkApp',
            supportEmail: 'support@TalkApp.com',
            expiryMinutes: 15,
          },
          templatePath: 'src/template/verify.hbs',
        }),
        [],
      );

      logger.info(`[Users] Asynchronous onboarding sequence successfully finalized for ${lowerEmail}`);
    } catch (err) {
      logger.error(`[Users] Critical failure inside background onboarding pipeline for ${lowerEmail}: ${err}`);
    }
  }

  public async verifyUser(userData: { email: string; otp: string }) {
    const { email, otp } = userData;
    const lowerEmail = email.toLowerCase();

    // Verify OTP using secure OTP service
    const isValid = await this.otpService.verifyOTP(lowerEmail, otp);

    if (!isValid) {
      throw new HttpException(400, 'Invalid or expired OTP');
    }

    const user = await UserModel.updateOne(
      { email: lowerEmail, isVerified: false }, // skip already-verified users
      { $set: { isVerified: true, isActive: true } },
    );

    if (!user) {
      throw new HttpException(404, 'User not found');
    }

    logger.info(`[Users] Email verified for ${lowerEmail}`);
    return user;
  }

  public async resendOtp(email: string) {
    const lowerEmail = email.toLowerCase();

    const [user, otp] = await Promise.all([
      UserModel.findOne(
        { email: lowerEmail },
        { isVerified: 1, displayName: 1 }, // lean projection
      ).lean(),
      this.otpService.generateAndStoreOTP(lowerEmail),
    ]);

    if (!user) throw new HttpException(404, 'User not found');
    if (user.isVerified) throw new HttpException(400, 'Email already verified');

    // Email is fully off the critical path
    setImmediate(async () => {
      try {
        await sendEmail(
          [lowerEmail],
          `Verify Your Email for TalkApp - Your OTP Code`,
          renderEmail({
            data: {
              name: user.displayName,
              otp,
              appName: 'TalkApp',
              supportEmail: 'support@TalkApp.com',
              expiryMinutes: 15,
            },
            templatePath: 'src/template/verify.hbs',
          }),
          [],
        );
        logger.info(`[Users] OTP resent to ${lowerEmail}`);
      } catch (err) {
        logger.error(`[Users] Failed to resend OTP to ${lowerEmail}: ${err}`);
        // TODO: push to BullMQ retry queue here
      }
    });

    return {
      message: 'OTP sent successfully to your email',
      email: lowerEmail,
    };
  }

  public async updateUser(userId: any, userData: any) {
    if (!userId) throw new HttpException(400, 'User ID is required');

    const { bio, dateOfBirth, nativeLang, learningLangs, proficiencyLevels, location } = userData;

    const updatePayload: Record<string, any> = {};
    if (bio !== undefined) updatePayload.bio = bio;
    if (dateOfBirth !== undefined) updatePayload.dateOfBirth = dateOfBirth;
    if (nativeLang !== undefined) updatePayload.nativeLang = nativeLang;
    if (learningLangs !== undefined) updatePayload.learningLangs = learningLangs;
    if (proficiencyLevels !== undefined) updatePayload.proficiencyLevels = proficiencyLevels;
    if (location !== undefined) updatePayload.location = location;

    if (Object.keys(updatePayload).length === 0) return null;

    // 4. LATENCY FIX: Execute the update with lean() to bypass heavy Mongoose overhead
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updatePayload }, // Using $set guarantees only the specified properties change
      {
        new: true,
        runValidators: false,
        projection: {
          bio: 1,
          dateOfBirth: 1,
          nativeLang: 1,
          learningLangs: 1,
          proficiencyLevels: 1,
          location: 1,
        },
      },
    ).lean();

    if (!updatedUser) throw new HttpException(404, 'User not found');

    return updatedUser;
  }

  public async deleteUser(userId: number) {
    const findUser = await UserModel.findByIdAndDelete(userId);
    if (!findUser) throw new HttpException(404, 'User not found');
    return findUser;
  }
}
