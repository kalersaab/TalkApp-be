import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email address' })
  public email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password too long' })
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  public password: string;

  @IsString()
  @IsNotEmpty({ message: 'Display name is required' })
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(32, { message: 'Display name too long' })
  public displayName: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email address' })
  public email: string;

  @IsString()
  @IsNotEmpty()
  public password: string;
}

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty({ message: 'Google ID token is required' })
  public idToken: string;
}

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty({ message: 'Apple identity token is required' })
  public identityToken: string;
}
