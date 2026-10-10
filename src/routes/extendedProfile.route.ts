import { Router } from 'express';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import { ExtendedProfileController } from '@controllers/extendedProfile.controller';
import {
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

class ExtendedProfileRoute implements Routes {
  public path = '/profile';
  public controller = new ExtendedProfileController();
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ─── Public Routes (No Authentication Required) ───────────────────────────

    // GET /api/profile/username/check/:username - Check username availability (debounce-friendly)
    this.router.get(`${this.path}/username/check/:username`, this.controller.checkUsernameAvailability);

    // ─── Protected Routes (Authentication Required) ──────────────────────────

    this.router.use(AuthMiddleware);

    // ─── Profile Information ─────────────────────────────────────────────────

    // GET /api/profile/extended - Get complete profile information
    this.router.get(`${this.path}/extended`, this.controller.getExtendedProfile);

    // GET /api/profile/completion - Get profile completion status
    this.router.get(`${this.path}/completion`, this.controller.getProfileCompletionStatus);

    // ─── Profile Updates (Section-by-Section) ───────────────────────────────

    // PATCH /api/profile/basic - Update basic profile info (displayName, selfIntroduction, bio)
    this.router.patch(`${this.path}/basic`, validationMiddleware(UpdateBasicProfileDto, 'body'), this.controller.updateBasicInfo);

    // PATCH /api/profile/languages - Update language information
    this.router.patch(`${this.path}/languages`, validationMiddleware(UpdateLanguagesDto, 'body'), this.controller.updateLanguages);

    // PATCH /api/profile/interests - Update interests and hobbies
    this.router.patch(`${this.path}/interests`, validationMiddleware(UpdateInterestsDto, 'body'), this.controller.updateInterests);

    // PATCH /api/profile/location - Update location and places
    this.router.patch(`${this.path}/location`, validationMiddleware(UpdateLocationDto, 'body'), this.controller.updateLocation);

    // PATCH /api/profile/occupation - Update occupation information
    this.router.patch(`${this.path}/occupation`, validationMiddleware(UpdateOccupationDto, 'body'), this.controller.updateOccupation);

    // PATCH /api/profile/personal - Update personal info (gender, birthday) - ONE TIME ONLY
    this.router.patch(`${this.path}/personal`, validationMiddleware(UpdatePersonalInfoDto, 'body'), this.controller.updatePersonalInfo);

    // PATCH /api/profile/psychology - Update MBTI and psychology info
    this.router.patch(`${this.path}/psychology`, validationMiddleware(UpdatePsychologyDto, 'body'), this.controller.updatePsychology);

    // PATCH /api/profile/username - Update username
    this.router.patch(`${this.path}/username`, validationMiddleware(UpdateUsernameDto, 'body'), this.controller.updateUsername);

    // ─── Complete Profile Update ─────────────────────────────────────────────

    // PATCH /api/profile/complete - Update entire profile at once
    this.router.patch(`${this.path}/complete`, validationMiddleware(UpdateCompleteProfileDto, 'body'), this.controller.updateCompleteProfile);

    // ─── Profile Pictures ────────────────────────────────────────────────────

    // POST /api/profile/pictures - Upload new profile picture (max 4)
    this.router.post(`${this.path}/pictures`, validationMiddleware(UploadProfilePictureDto, 'body'), this.controller.uploadProfilePicture);

    // PATCH /api/profile/pictures/primary - Set primary profile picture
    this.router.patch(`${this.path}/pictures/primary`, validationMiddleware(SetPrimaryPictureDto, 'body'), this.controller.setPrimaryPicture);

    // DELETE /api/profile/pictures - Delete profile picture
    this.router.delete(`${this.path}/pictures`, validationMiddleware(DeleteProfilePictureDto, 'body'), this.controller.deleteProfilePicture);
  }
}

export default ExtendedProfileRoute;
