import { GetUserQueryDto } from '@/dtos/users.dto';
import { HttpException } from '@/exceptions/HttpException';
import { LoginUser, User } from '@interfaces/users.interface';
import { UserService } from '@services/users.service';
import { NextFunction, Request, Response } from 'express';

export class UserController {
  private user: UserService;
  constructor() {
    this.user = new UserService();
  }

  public getUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: GetUserQueryDto = req.query;
      const findAllUsersData = await this.user.findAllUser(query);
      res.status(200).json({ data: findAllUsersData, message: 'users fetched successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public getUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId: any = req.params.id;
      const findOneUserData: User = await this.user.findUserById(userId);

      res.status(200).json({ data: findOneUserData, message: 'user fetched successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: User = req.body;
      const createUserData = await this.user.createUser(userData);

      res.status(201).json({ data: createUserData, message: 'user created successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public verifyUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData = req.body;
      const verifyUserData = await this.user.verifyUser(userData);

      res.status(200).json({ data: verifyUserData, message: 'user verified successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };
  public resendOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.body.email;
      const resendOtpData = await this.user.resendOtp(email);

      res.status(200).json({ data: resendOtpData, message: 'otp resend successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public loginUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: LoginUser = req.body;
      const loginUserData = await this.user.login(userData);

      res.status(200).json({ data: loginUserData, message: 'user logged in successfully' });
    } catch (error) {
      next(new HttpException(error.status, error.message || 'Something went wrong'));
    }
  };

  public getLoginUserData = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user?._id;
      const userData = await this.user.meApi(user);
      res.status(200).json({ data: userData[0], message: 'user data fetched successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId: any = req.params.id;
      const userData: any = req.body;
      const updateUserData = await this.user.updateUser(userId, userData);

      res.status(200).json({ data: updateUserData, message: 'user updated successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };

  public deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId: any = req.params.id;
      const deleteUserData = await this.user.deleteUser(userId);

      res.status(200).json({ data: deleteUserData, message: 'user deleted successfully' });
    } catch (error) {
      next(new HttpException(500, error.message || 'Something went wrong'));
    }
  };
}