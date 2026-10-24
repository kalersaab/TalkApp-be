import type { Response, NextFunction } from 'express';
import type { RequestWithUser } from '@interfaces/auth.interface';
import { ExtendedProfileService } from '@services/extendedProfile.service';
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
} from '@dtos/profile.dto';

export class ExtendedProfileController {
  private service: ExtendedProfileService;

  constructor() {
    this.service = new ExtendedProfileService();
  }

  private getUserId(req: RequestWithUser): string | null {
    const userId = req.user?._id?.toString();
    return userId || null;
  }

  public getExtendedProfile = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const result = await this.service.getExtendedProfile(userId);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Extended profile retrieved successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateBasicInfo = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateBasicProfileDto = req.body;
      const result = await this.service.updateBasicInfo(userId, updateData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Basic profile information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateLanguages = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateLanguagesDto = req.body;
      const result = await this.service.updateLanguages(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Language information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateInterests = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateInterestsDto = req.body;
      const result = await this.service.updateInterests(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Interests and hobbies updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateLocation = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateLocationDto = req.body;
      const result = await this.service.updateLocation(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Location information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateOccupation = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateOccupationDto = req.body;
      const result = await this.service.updateOccupation(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Occupation information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updatePersonalInfo = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdatePersonalInfoDto = req.body;
      const result = await this.service.updatePersonalInfo(userId, updateData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Personal information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updatePsychology = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdatePsychologyDto = req.body;
      const result = await this.service.updatePsychology(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Psychology information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateUsername = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateUsernameDto = req.body;
      const result = await this.service.updateUsername(userId, updateData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Username updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public checkUsernameAvailability = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username } = req.params;
      const userId = this.getUserId(req);

      const usernameRegex = /^[a-z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
        });
        return;
      }

      const result = await this.service.checkUsernameAvailability(username, userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public uploadProfilePicture = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UploadProfilePictureDto = req.body;
      const result = await this.service.uploadProfilePicture(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Profile picture uploaded successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public setPrimaryPicture = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: SetPrimaryPictureDto = req.body;
      const result = await this.service.setPrimaryPicture(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Primary profile picture set successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteProfilePicture = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: DeleteProfilePictureDto = req.body;
      const result = await this.service.deleteProfilePicture(userId, updateData);

      res.status(200).json({
        success: true,
        data: { profile: result },
        message: 'Profile picture deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public updateCompleteProfile = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const updateData: UpdateCompleteProfileDto = req.body;
      const result = await this.service.updateCompleteProfile(userId, updateData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Complete profile updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  public getProfileCompletionStatus = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const result = await this.service.getProfileCompletionStatus(userId);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Profile completion status retrieved successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}
