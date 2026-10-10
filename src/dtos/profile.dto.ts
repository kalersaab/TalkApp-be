import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, IsDateString, IsObject, MinLength, MaxLength, Matches } from 'class-validator';

export enum ProficiencyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

/**
 * Complete profile for new Google Sign-In users
 * This is called after initial Google auth when isNewUser=true
 */
export class CompleteProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(20, { message: 'Username must be at most 20 characters' })
  @Matches(/^[a-z0-9_]+$/, { message: 'Username can only contain lowercase letters, numbers, and underscores' })
  public username: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gender must be male, female, or other' })
  public gender?: Gender;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format' })
  public dateOfBirth?: string;

  @IsString()
  @IsNotEmpty({ message: 'Native language is required' })
  public nativeLang: string;

  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true, message: 'Each learning language code must be at least 1 character' })
  public learningLangs: string[];

  @IsObject()
  @IsOptional()
  public proficiencyLevels?: Record<string, ProficiencyLevel>;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Bio must be at most 300 characters' })
  public bio?: string;

  @IsOptional()
  @IsArray()
  public location?: [number, number]; // [longitude, latitude]
}

/**
 * Update existing user profile
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(32, { message: 'Display name must be at most 32 characters' })
  public displayName?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gender must be male, female, or other' })
  public gender?: Gender;

  @IsOptional()
  @IsDateString()
  public dateOfBirth?: string;

  @IsOptional()
  @IsString()
  public nativeLang?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public learningLangs?: string[];

  @IsOptional()
  @IsObject()
  public proficiencyLevels?: Record<string, ProficiencyLevel>;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Bio must be at most 300 characters' })
  public bio?: string;

  @IsOptional()
  @IsArray()
  public location?: [number, number];

  @IsOptional()
  @IsString()
  public avatarUrl?: string;
}
