import { SECRET_KEY } from '@/config';
import { GetUserQueryDto } from '@/dtos/users.dto';
import { HttpException } from '@exceptions/HttpException';
import { LoginUser, User } from '@interfaces/users.interface';
import { UserModel } from '@models/users.model';
import { compare, hash } from 'bcrypt';
import { sign } from 'jsonwebtoken';
import { OtpModel } from '@/models/otp.model';

export class UserService {
  public async findUserById(userId: any) {
    const findUser = UserModel.findById(userId);
    if (!findUser) throw new HttpException(409, "User doesn't exist");

    return findUser;
  }

  public async findAllUser(query: GetUserQueryDto) {
    const pageIndex = parseInt(query.page, 10) || 1;
    const pageSize = parseInt(query.limit, 10) || 10;

    const searchCriteria: { isActive?: boolean; [key: string]: any } = {};

    if (query?.isActive === true) {
      searchCriteria.isActive = true;
    }
    if (query?.isActive === false) {
      searchCriteria.isActive = false;
    }
    if (query?.keyword) {
      searchCriteria['$or'] = [
        {
          name: { $regex: `${query.keyword?.trim()}`, $options: 'i' },
        },
        {
          email: { $regex: `${query.keyword?.trim()}`, $options: 'i' },
        },
      ];
    }
    const user = await UserModel.aggregate([
      { $match: searchCriteria },
      { $sort: { createdAt: -1 } },
      { $project: { password: 0 } },
      {
        $facet: {
          data: [{ $skip: (pageIndex - 1) * pageSize }, { $limit: pageSize }],
          count: [{ $count: 'total' }],
          isActiveCount: [{ $match: { isActive: true } }, { $count: 'total' }],
          notActiveCount: [{ $match: { isActive: false } }, { $count: 'total' }],
        },
      },
    ]);
    return {
      data: user[0]?.data,
      count: user[0]?.count[0]?.total,
      isActiveCount: user[0]?.isActiveCount[0]?.total || 0,
      notActiveCount: user[0]?.notActiveCount[0]?.total || 0,
    };
  }

  public async createUser(userData: User) {
    if(!userData){
      throw new HttpException(400,"empty payload")
    }
    const { email, password, name } = userData;
    const findUser = await UserModel.findOne({ email: email });
    if (findUser) throw new HttpException(409, `This email ${userData.email} already exists`);

    const hashPassword = await hash(password, 10);
    const createUserData = await UserModel.create({
      ...userData,
      password: hashPassword,
      isVerified: false,
    });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await OtpModel.create({
      email,
      otp,
      otpExpires,
    });
    return {...createUserData, otp};
  }

  public async verifyUser(userData) {
    const { email, otp } = userData;
    const otpDoc: any = await OtpModel.findOne({ email: email, otp: otp }).exec();
    if (!otpDoc) {
      throw new HttpException(400, 'Invalid OTP');
    }

    const now = new Date();

    if (new Date(otpDoc.otpExpires) < now) {
      await OtpModel.deleteOne({ _id: otpDoc._id });
      throw new HttpException(400, 'OTP has expired');
    }

    const User = await UserModel.findOneAndUpdate({ email: email }, { isVerified: true }, { new: true });
    User?.save();

    if (!User) {
      throw new Error('User not found');
    }
    await OtpModel.deleteOne({ _id: otpDoc._id });
    return User;
  }

  public async resendOtp(email: string) {
    const user = await UserModel.findOne({ email: email });
    if (!user) {
      throw new HttpException(404, 'User not found');
    }
    if (user?.isVerified === true) {
      return { error: 'Email is already verified', status: 400 };
    }

    await OtpModel.deleteMany({ email }).exec();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await OtpModel.create({
      email,
      otp,
      otpExpires: otpExpires,
    });
      return otp
  }

  public async login(userData: LoginUser) {
    const { email, password } = userData;
    const findUser = await UserModel.findOne({
      email: email,
    });

    if (!findUser) {
      throw new HttpException(404, 'User not found');
    }
    if (!findUser.isVerified) {
      throw new HttpException(400, 'User is not verified');
    }
    if (!findUser.isActive) {
      throw new HttpException(403, 'User is not active');
    }

    const isMatch = await compare(password, findUser.password);
    if (!isMatch) {
      throw new HttpException(401, 'Invalid credentials');
    }

    const token = sign({ _id: findUser._id, email: findUser.email, role: findUser.role }, SECRET_KEY as any, {
      expiresIn: '60d',
    });
    const response = {
      user: {
        id: findUser._id,
        name: findUser.name,
        email: findUser.email,
        avatar: findUser.avatar,
        role: findUser.role,
      },
      token: token,
    };
    return response;
  }

  public async updateUser(userId: any, userData: any) {
    const findUser = await UserModel.findById(userId);
    if (!findUser) throw new HttpException(409, "User doesn't exist");

    const hashedPassword = await hash(userData.password, 10);
    userData = { ...userData, password: hashedPassword };
    const updatedUser = await UserModel.findByIdAndUpdate(userId, userData, { new: true }).select('-password');
    return updatedUser;
  }

  public async deleteUser(userId: number) {
    const findUser = await UserModel.findByIdAndDelete(userId);
    if (!findUser) throw new HttpException(404, 'Merchent not found');
    return findUser;
  }
}