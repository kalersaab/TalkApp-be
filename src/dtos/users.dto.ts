import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsArray, IsEnum, Matches, MaxLength, MinLength } from 'class-validator';

export enum ProficiencyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email address' })
  public email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(32, { message: 'Password too long' })
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

export class UpdateUserDto {
  @IsString()
  public id?: string;
}

export class UpdateUserWithPasswordDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(32)
  public name?: string;

  @IsEmail()
  @IsOptional()
  public email?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(32)
  public password?: string;
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
  public isActive?: boolean;

  @IsString()
  @IsOptional()
  public keyword?: string;

  @IsString()
  @IsOptional()
  public name?: string;

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
