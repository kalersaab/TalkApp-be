import { AuthMiddleware } from '@/middlewares/auth.middleware';
import { UserController } from '@controllers/users.controller';
import {
  CreateUserDto,
  GetSingleUserParamsDto,
  GetUserQueryDto,
  ResendOtpDto,
  UpdateUserDto,
  UpdateUserWithPasswordDto,
  VerifyUserDto,
} from '@dtos/users.dto';
import { Routes } from '@interfaces/routes.interface';
import ValidationMiddleware from '@middlewares/validation.middleware';
import { Router } from 'express';

export class UserRoute implements Routes {
  public path = '/users';
  public router = Router();
  public user = new UserController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, AuthMiddleware, ValidationMiddleware(GetUserQueryDto, 'query', true), this.user.getUsers);
    this.router.get(`${this.path}/:id`, AuthMiddleware, ValidationMiddleware(GetSingleUserParamsDto, 'params', true), this.user.getUserById);
    this.router.post(`${this.path}`, ValidationMiddleware(CreateUserDto, 'body', true), this.user.createUser);

    this.router.post(`${this.path}/verify-email`, ValidationMiddleware(VerifyUserDto, 'body', true), this.user.verifyUser);
    this.router.post(`${this.path}/resend-otp`, ValidationMiddleware(ResendOtpDto, 'body', true), this.user.resendOtp);
    this.router.put(
      `${this.path}/:id`,
      AuthMiddleware,
      ValidationMiddleware(UpdateUserDto, 'params', true),
      ValidationMiddleware(UpdateUserWithPasswordDto, 'body', true),
      this.user.updateUser,
    );
    this.router.delete(`${this.path}/:id`, AuthMiddleware, ValidationMiddleware(GetSingleUserParamsDto, 'params', true), this.user.deleteUser);
  }
}