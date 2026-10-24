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
    this.router.get(`${this.path}/username/check/:username`, this.controller.checkUsernameAvailability);

    this.router.use(AuthMiddleware);

    this.router.get(`${this.path}/extended`, this.controller.getExtendedProfile);

    this.router.get(`${this.path}/completion`, this.controller.getProfileCompletionStatus);

    this.router.patch(`${this.path}/basic`, validationMiddleware(UpdateBasicProfileDto, 'body'), this.controller.updateBasicInfo);

    this.router.patch(`${this.path}/languages`, validationMiddleware(UpdateLanguagesDto, 'body'), this.controller.updateLanguages);

    this.router.patch(`${this.path}/interests`, validationMiddleware(UpdateInterestsDto, 'body'), this.controller.updateInterests);

    this.router.patch(`${this.path}/location`, validationMiddleware(UpdateLocationDto, 'body'), this.controller.updateLocation);

    this.router.patch(`${this.path}/occupation`, validationMiddleware(UpdateOccupationDto, 'body'), this.controller.updateOccupation);

    this.router.patch(`${this.path}/personal`, validationMiddleware(UpdatePersonalInfoDto, 'body'), this.controller.updatePersonalInfo);

    this.router.patch(`${this.path}/psychology`, validationMiddleware(UpdatePsychologyDto, 'body'), this.controller.updatePsychology);

    this.router.patch(`${this.path}/username`, validationMiddleware(UpdateUsernameDto, 'body'), this.controller.updateUsername);

    this.router.patch(`${this.path}/complete`, validationMiddleware(UpdateCompleteProfileDto, 'body'), this.controller.updateCompleteProfile);

    this.router.post(`${this.path}/pictures`, validationMiddleware(UploadProfilePictureDto, 'body'), this.controller.uploadProfilePicture);

    this.router.patch(`${this.path}/pictures/primary`, validationMiddleware(SetPrimaryPictureDto, 'body'), this.controller.setPrimaryPicture);

    this.router.delete(`${this.path}/pictures`, validationMiddleware(DeleteProfilePictureDto, 'body'), this.controller.deleteProfilePicture);
  }
}

export default ExtendedProfileRoute;
