import { HttpException } from '@exceptions/HttpException';
import UserModel from '@models/users.model';
import UserProfileModel, { IUserProfile } from '@models/userProfile.model';
import type { IUser } from '@interfaces/users.interface';
import { getRedisService } from '@databases/redis';
import { logger } from '@utils/logger';
import type {
  UpdateBasicProfileDto,
  UpdateLanguagesDto,
  UpdateInterestsDto,
  UpdateLocationDto,
  UpdateOccupationDto,
  UpdatePersonalInfoDto,
  UpdatePsychologyDto,
  UpdateUsernameDto,
  UploadProfilePictureDto,
  UpdateCompleteProfileDto,
  SetPrimaryPictureDto,
  DeleteProfilePictureDto,
  CheckUsernameDto,
} from '@dtos/profile.dto';

export class ExtendedProfileService {
  private redis = getRedisService();

  // ─── Get Extended Profile ─────────────────────────────────────────────────────

  public async getExtendedProfile(userId: string): Promise<{
    user: Partial<IUser>;
    profile: IUserProfile | null;
    completionPercentage: number;
  }> {
    try {
      // Check cache first
      const cachedProfile = await this.redis.getProfile(userId);
      if (cachedProfile) {
        return cachedProfile as {
          user: Partial<IUser>;
          profile: IUserProfile | null;
          completionPercentage: number;
        };
      }

      // Get user basic info and extended profile
      const [user, profile] = await Promise.all([
        UserModel.findById(userId)
          .select('displayName username email avatarUrl nativeLang learningLangs gender dateOfBirth bio location isVerified createdAt')
          .lean(),
        UserProfileModel.findOne({ userId }).lean(),
      ]);

      if (!user) {
        throw new HttpException(404, 'User not found');
      }

      const result = {
        user,
        profile,
        completionPercentage: profile?.completionPercentage || 0,
      };

      // Cache for 5 minutes (cast to generic ProfileData type)
      await this.redis.cacheProfile(userId, result as Record<string, unknown>, 5 * 60);

      return result;
    } catch (err) {
      logger.error(`[ExtendedProfile] Get profile failed: ${(err as Error).message}`);
      throw err;
    }
  }

  // ─── Update Basic Profile Info ────────────────────────────────────────────────

  public async updateBasicInfo(
    userId: string,
    updateData: UpdateBasicProfileDto,
  ): Promise<{
    user?: Partial<IUser>;
    profile: IUserProfile;
  }> {
    try {
      const updates: any = {};
      const userUpdates: any = {};

      // Handle displayName (update in User model)
      if (updateData.displayName !== undefined) {
        userUpdates.displayName = updateData.displayName;
      }

      // Handle profile fields
      if (updateData.selfIntroduction !== undefined) {
        updates.selfIntroduction = updateData.selfIntroduction;
      }
      if (updateData.bio !== undefined) {
        updates.bio = updateData.bio;
        userUpdates.bio = updateData.bio; // Also update in User model for compatibility
      }

      // Update user model if needed
      let user = null;
      if (Object.keys(userUpdates).length > 0) {
        user = await UserModel.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true }).select('displayName username email avatarUrl bio');
      }

      // Update or create profile
      const profile = await UserProfileModel.findOneAndUpdate({ userId }, { $set: updates }, { new: true, upsert: true });

      // Invalidate cache
      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Basic info updated for user ${userId}`);
      return { user: user?.toObject(), profile };
    } catch (err) {
      logger.error(`[ExtendedProfile] Update basic info failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update basic profile information');
    }
  }

  // ─── Update Languages ─────────────────────────────────────────────────────────

 public async updateLanguages(userId: string, updateData: UpdateLanguagesDto): Promise<Partial<IUser>> {
  try {
    const userUpdates: Record<string, any> = {};

    // Build update payload
    if (updateData.nativeLanguage !== undefined) {
      userUpdates.nativeLang = updateData.nativeLanguage;
    }

    if (updateData.learningLanguages !== undefined) {
      userUpdates.learningLangs = updateData.learningLanguages;
    }

    if (updateData.proficiencyLevels && Object.keys(updateData.proficiencyLevels).length > 0) {
      userUpdates.proficiencyLevels = updateData.proficiencyLevels;
    }

    // Fast-path: Return empty immediately if no fields provided
    if (Object.keys(userUpdates).length === 0) {
      return {};
    }

    // OPTIMIZATION 1: Use updateOne instead of findByIdAndUpdate
    // Prevents MongoDB from having to fetch and serialize the document back to Node.js
    const result = await UserModel.updateOne(
      { _id: userId },
      { $set: userUpdates }
    ).exec();

    if (result.matchedCount === 0) {
      throw new HttpException(404, 'User not found');
    }

    // OPTIMIZATION 2: Properly fire-and-forget cache invalidation
    // Using void to explicitly indicate we don't care about the result
    this.redis.invalidateProfile(userId).catch((err) => {
      logger.warn(`[Redis] Cache invalidation failed for ${userId}: ${err.message}`);
    });

    // Return only updated fields constructed in-memory
    return {
      _id: userId,
      ...userUpdates,
    };
  } catch (err) {
    // FIX: Preserve existing HttpExceptions (e.g., 404)
    if (err instanceof HttpException) {
      throw err;
    }

    logger.error(`[ExtendedProfile] Update languages failed: ${(err as Error).message}`);
    throw new HttpException(500, 'Failed to update language information');
  }
}

  // ─── Update Interests & Hobbies ───────────────────────────────────────────────

  public async updateInterests(userId: string, updateData: UpdateInterestsDto): Promise<IUserProfile> {
    try {
      const updates: any = {};

      if (updateData.interests !== undefined) {
        updates.interests = updateData.interests;
      }

      const profile = await UserProfileModel.findOneAndUpdate({ userId }, { $set: updates }, { new: true, upsert: true });

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Interests updated for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Update interests failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update interests and hobbies');
    }
  }

  // ─── Update Location & Places ─────────────────────────────────────────────────

  public async updateLocation(userId: string, updateData: UpdateLocationDto): Promise<IUserProfile> {
    try {
      const updates: any = {};

      if (updateData.placesToGo !== undefined) {
        updates.placesToGo = updateData.placesToGo;
      }

      if (updateData.hometown !== undefined) {
        updates.hometown = updateData.hometown;
      }

      if (updateData.currentLocation !== undefined) {
        updates.currentLocation = updateData.currentLocation;
      }

      if (updateData.showRegionInProfile !== undefined) {
        updates.showRegionInProfile = updateData.showRegionInProfile;
      }

      const profile = await UserProfileModel.findOneAndUpdate({ userId }, { $set: updates }, { new: true, upsert: true });

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Location updated for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Update location failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update location information');
    }
  }

  // ─── Update Occupation ────────────────────────────────────────────────────────

  public async updateOccupation(userId: string, updateData: UpdateOccupationDto): Promise<IUserProfile> {
    try {
      const profile = await UserProfileModel.findOneAndUpdate(
        { userId },
        { $set: { occupation: updateData.occupation } },
        { new: true, upsert: true },
      );

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Occupation updated for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Update occupation failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update occupation information');
    }
  }

  // ─── Update Personal Info (One-time edit) ─────────────────────────────────────

  public async updatePersonalInfo(
    userId: string,
    updateData: UpdatePersonalInfoDto,
  ): Promise<{
    user: Partial<IUser>;
    profile: IUserProfile;
  }> {
    try {
      // Check if gender/birthday already set (one-time edit restriction)
      const existingProfile = await UserProfileModel.findOne({ userId });

      if (updateData.gender && existingProfile?.gender) {
        throw new HttpException(400, 'Gender can only be set once');
      }

      if (updateData.birthday && existingProfile?.birthday) {
        throw new HttpException(400, 'Birthday can only be set once');
      }

      const updates: any = {};
      const userUpdates: any = {};

      if (updateData.gender !== undefined) {
        updates.gender = updateData.gender;
        userUpdates.gender = updateData.gender;
      }

      if (updateData.birthday !== undefined) {
        const birthday = new Date(updateData.birthday);
        updates.birthday = birthday;
        userUpdates.dateOfBirth = birthday;

        // Auto-calculate zodiac sign (will be handled in pre-save hook)
      }

      // Update both models
      const [user, profile] = await Promise.all([
        Object.keys(userUpdates).length > 0
          ? UserModel.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true }).select('displayName username gender dateOfBirth')
          : UserModel.findById(userId).select('displayName username gender dateOfBirth'),
        UserProfileModel.findOneAndUpdate({ userId }, { $set: updates }, { new: true, upsert: true }),
      ]);

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Personal info updated for user ${userId}`);
      return { user: user?.toObject(), profile };
    } catch (err) {
      logger.error(`[ExtendedProfile] Update personal info failed: ${(err as Error).message}`);
      if (err instanceof HttpException) throw err;
      throw new HttpException(500, 'Failed to update personal information');
    }
  }

  // ─── Update Psychology ────────────────────────────────────────────────────────

  public async updatePsychology(userId: string, updateData: UpdatePsychologyDto): Promise<IUserProfile> {
    try {
      const profile = await UserProfileModel.findOneAndUpdate({ userId }, { $set: { mbtiType: updateData.mbtiType } }, { new: true, upsert: true });

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Psychology info updated for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Update psychology failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update psychology information');
    }
  }

  // ─── Update Username ──────────────────────────────────────────────────────────

  public async updateUsername(userId: string, updateData: UpdateUsernameDto): Promise<{ user: Partial<IUser> }> {
    try {
      // Check if username is available
      const existingUser = await UserModel.findOne({
        username: updateData.username,
        _id: { $ne: userId },
      });

      if (existingUser) {
        throw new HttpException(400, 'Username already taken');
      }

      const user = await UserModel.findByIdAndUpdate(userId, { $set: { username: updateData.username } }, { new: true }).select(
        'displayName username email avatarUrl',
      );

      if (!user) {
        throw new HttpException(404, 'User not found');
      }

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Username updated for user ${userId} to ${updateData.username}`);
      return { user: user.toObject() };
    } catch (err) {
      logger.error(`[ExtendedProfile] Update username failed: ${(err as Error).message}`);
      if (err instanceof HttpException) throw err;
      throw new HttpException(500, 'Failed to update username');
    }
  }

  // ─── Check Username Availability ──────────────────────────────────────────────

  public async checkUsernameAvailability(
    username: string,
    excludeUserId?: string,
  ): Promise<{
    available: boolean;
    message: string;
  }> {
    try {
      // Query to find existing user with this username
      const query: any = { username };

      // If excludeUserId is provided, exclude that user (for update scenarios)
      if (excludeUserId) {
        query._id = { $ne: excludeUserId };
      }

      const existingUser = await UserModel.findOne(query).lean();

      if (existingUser) {
        return {
          available: false,
          message: 'Username is already taken',
        };
      }

      return {
        available: true,
        message: 'Username is available',
      };
    } catch (err) {
      logger.error(`[ExtendedProfile] Check username availability failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to check username availability');
    }
  }

  // ─── Profile Pictures Management ──────────────────────────────────────────────

  public async uploadProfilePicture(userId: string, updateData: UploadProfilePictureDto): Promise<IUserProfile> {
    try {
      const profile = (await UserProfileModel.findOne({ userId })) || new UserProfileModel({ userId, profilePictures: [] });

      // Check if max pictures reached
      if (profile.profilePictures.length >= 4) {
        throw new HttpException(400, 'Maximum 4 profile pictures allowed');
      }

      // If setting as primary, unset all other primary flags
      if (updateData.isPrimary) {
        profile.profilePictures.forEach(pic => (pic.isPrimary = false));

        // Also update main avatarUrl in User model
        await UserModel.findByIdAndUpdate(userId, { avatarUrl: updateData.url });
      }

      // Add new picture
      profile.profilePictures.push({
        url: updateData.url,
        isPrimary: updateData.isPrimary || profile.profilePictures.length === 0, // First picture is primary by default
        uploadedAt: new Date(),
      });

      await profile.save();
      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Profile picture uploaded for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Upload picture failed: ${(err as Error).message}`);
      if (err instanceof HttpException) throw err;
      throw new HttpException(500, 'Failed to upload profile picture');
    }
  }

  public async setPrimaryPicture(userId: string, updateData: SetPrimaryPictureDto): Promise<IUserProfile> {
    try {
      const profile = await UserProfileModel.findOne({ userId });
      if (!profile) {
        throw new HttpException(404, 'Profile not found');
      }

      // Find the picture
      const pictureIndex = profile.profilePictures.findIndex(pic => pic.url === updateData.url);
      if (pictureIndex === -1) {
        throw new HttpException(404, 'Picture not found');
      }

      // Unset all primary flags
      profile.profilePictures.forEach(pic => (pic.isPrimary = false));

      // Set new primary
      profile.profilePictures[pictureIndex].isPrimary = true;

      // Update main avatarUrl in User model
      await Promise.all([profile.save(), UserModel.findByIdAndUpdate(userId, { avatarUrl: updateData.url })]);

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Primary picture set for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Set primary picture failed: ${(err as Error).message}`);
      if (err instanceof HttpException) throw err;
      throw new HttpException(500, 'Failed to set primary picture');
    }
  }

  public async deleteProfilePicture(userId: string, updateData: DeleteProfilePictureDto): Promise<IUserProfile> {
    try {
      const profile = await UserProfileModel.findOne({ userId });
      if (!profile) {
        throw new HttpException(404, 'Profile not found');
      }

      // Find and remove the picture
      const pictureIndex = profile.profilePictures.findIndex(pic => pic.url === updateData.url);
      if (pictureIndex === -1) {
        throw new HttpException(404, 'Picture not found');
      }

      const wasPrimary = profile.profilePictures[pictureIndex].isPrimary;
      profile.profilePictures.splice(pictureIndex, 1);

      // If deleted picture was primary, set first remaining as primary
      if (wasPrimary && profile.profilePictures.length > 0) {
        profile.profilePictures[0].isPrimary = true;
        await UserModel.findByIdAndUpdate(userId, { avatarUrl: profile.profilePictures[0].url });
      } else if (wasPrimary && profile.profilePictures.length === 0) {
        await UserModel.findByIdAndUpdate(userId, { avatarUrl: null });
      }

      await profile.save();
      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Profile picture deleted for user ${userId}`);
      return profile;
    } catch (err) {
      logger.error(`[ExtendedProfile] Delete picture failed: ${(err as Error).message}`);
      if (err instanceof HttpException) throw err;
      throw new HttpException(500, 'Failed to delete profile picture');
    }
  }

  // ─── Complete Profile Update ──────────────────────────────────────────────────

  public async updateCompleteProfile(
    userId: string,
    updateData: UpdateCompleteProfileDto,
  ): Promise<{
    user?: Partial<IUser>;
    profile: IUserProfile;
  }> {
    try {
      const userUpdates: any = {};
      const profileUpdates: any = {};

      // User model fields
      if (updateData.displayName !== undefined) {
        userUpdates.displayName = updateData.displayName;
      }
      if (updateData.nativeLanguage !== undefined) {
        userUpdates.nativeLang = updateData.nativeLanguage;
        profileUpdates.nativeLanguage = updateData.nativeLanguage;
      }
      if (updateData.learningLanguages !== undefined) {
        userUpdates.learningLangs = updateData.learningLanguages;
        profileUpdates.learningLanguages = updateData.learningLanguages;
      }
      if (updateData.bio !== undefined) {
        userUpdates.bio = updateData.bio;
      }
      if (updateData.proficiencyLevels !== undefined) {
        userUpdates.proficiencyLevels = new Map(Object.entries(updateData.proficiencyLevels));
      }

      // Profile model fields
      Object.keys(updateData).forEach(key => {
        if (!['displayName'].includes(key)) {
          profileUpdates[key] = updateData[key as keyof UpdateCompleteProfileDto];
        }
      });

      // Update both models in parallel
      const [user, profile] = await Promise.all([
        Object.keys(userUpdates).length > 0
          ? UserModel.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true }).select(
              'displayName username email avatarUrl nativeLang learningLangs bio',
            )
          : null,
        UserProfileModel.findOneAndUpdate({ userId }, { $set: profileUpdates }, { new: true, upsert: true }),
      ]);

      await this.redis.invalidateProfile(userId);

      logger.info(`[ExtendedProfile] Complete profile updated for user ${userId}`);
      return { user: user?.toObject(), profile };
    } catch (err) {
      logger.error(`[ExtendedProfile] Update complete profile failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to update complete profile');
    }
  }

  // ─── Get Profile Completion Status ────────────────────────────────────────────

  public async getProfileCompletionStatus(userId: string): Promise<{
    completionPercentage: number;
    isComplete: boolean;
    missingFields: string[];
    sections: {
      basicInfo: boolean;
      languages: boolean;
      interests: boolean;
      location: boolean;
      occupation: boolean;
      personal: boolean;
      psychology: boolean;
      pictures: boolean;
    };
  }> {
    try {
      const profile = await UserProfileModel.findOne({ userId });

      if (!profile) {
        return {
          completionPercentage: 0,
          isComplete: false,
          missingFields: [
            'selfIntroduction',
            'bio',
            'teachingLanguages',
            'learningLanguages',
            'interests',
            'hobbies',
            'placesToGo',
            'hometown',
            'occupation',
            'gender',
            'birthday',
            'mbtiType',
            'profilePictures',
            'currentLocation',
          ],
          sections: {
            basicInfo: false,
            languages: false,
            interests: false,
            location: false,
            occupation: false,
            personal: false,
            psychology: false,
            pictures: false,
          },
        };
      }

      const missingFields: string[] = [];

      // Check each field
      if (!profile.selfIntroduction) missingFields.push('selfIntroduction');
      if (!profile.bio) missingFields.push('bio');
      if (!profile.teachingLanguages?.length) missingFields.push('teachingLanguages');
      if (!profile.learningLanguages?.length) missingFields.push('learningLanguages');
      if (!profile.interests?.length) missingFields.push('interests');
      if (!profile.hobbies?.length) missingFields.push('hobbies');
      if (!profile.placesToGo?.length) missingFields.push('placesToGo');
      if (!profile.hometown) missingFields.push('hometown');
      if (!profile.occupation?.length) missingFields.push('occupation');
      if (!profile.gender) missingFields.push('gender');
      if (!profile.birthday) missingFields.push('birthday');
      if (!profile.mbtiType) missingFields.push('mbtiType');
      if (!profile.profilePictures?.length) missingFields.push('profilePictures');
      if (!profile.currentLocation?.city) missingFields.push('currentLocation');

      // Calculate section completion
      const sections = {
        basicInfo: !!(profile.selfIntroduction && profile.bio),
        languages: !!(profile.teachingLanguages?.length && profile.learningLanguages?.length),
        interests: !!(profile.interests?.length && profile.hobbies?.length),
        location: !!(profile.placesToGo?.length && profile.hometown && profile.currentLocation?.city),
        occupation: !!profile.occupation?.length,
        personal: !!(profile.gender && profile.birthday),
        psychology: !!profile.mbtiType,
        pictures: !!profile.profilePictures?.length,
      };

      return {
        completionPercentage: profile.completionPercentage,
        isComplete: profile.isComplete,
        missingFields,
        sections,
      };
    } catch (err) {
      logger.error(`[ExtendedProfile] Get completion status failed: ${(err as Error).message}`);
      throw new HttpException(500, 'Failed to get profile completion status');
    }
  }
}
