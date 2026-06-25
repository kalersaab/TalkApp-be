import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  Matches,
  MaxLength,
  MinLength,
  IsDateString,
  IsObject,
} from 'class-validator';

export enum ProficiencyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email address' })
  public email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password too long' })
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  public passwordHash: string;

  @IsString()
  @IsNotEmpty({ message: 'Display name is required' })
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(32, { message: 'Display name too long' })
  public displayName: string;

  @IsString()
  @IsOptional()
  public gender?: string;

  @IsOptional()
  public dateOfBirth?: Date;

  @IsString()
  @IsOptional()
  public nativeLang?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public learningLangs?: string[];

  @IsOptional()
  public proficiencyLevels?: Record<string, ProficiencyLevel>;
}

export class LoginUserDto {
  @IsEmail()
  public email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(32)
  public password: string;
}

export class UpdateUserIdDto {
  @IsString()
  public id?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  nativeLang?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learningLangs?: string[];

  @IsOptional()
  @IsObject()
  proficiencyLevels?: Record<string, string>; // e.g., { "es": "B2", "fr": "A1" }

  @IsOptional()
  @IsObject()
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
}
export class GetSingleUserParamsDto {
  @IsString()
  public id: string;
}
export class VerifyUserDto {
  @IsEmail()
  public email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(6)
  public otp: string;
}

export class GetUserQueryDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  public isActive?: boolean;

  @IsString()
  @IsOptional()
  public keyword?: string;

  @IsString()
  @IsOptional()
  public username?: string;

  @IsString()
  @IsOptional()
  public email?: string;

  @IsString()
  @IsOptional()
  public page?: string;

  @IsString()
  @IsOptional()
  public limit?: string;
}
export class ResendOtpDto {
  @IsEmail()
  public email: string;
}
