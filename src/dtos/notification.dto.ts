import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveDeviceTokenDto {
  @IsIn(['android', 'ios'], { message: "platform must be 'android' or 'ios'" })
  public platform: 'android' | 'ios';

  @IsString()
  @IsNotEmpty({ message: 'token is required' })
  public token: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  public messages?: boolean;

  @IsOptional()
  @IsBoolean()
  public follows?: boolean;

  @IsOptional()
  @IsBoolean()
  public achievements?: boolean;

  @IsOptional()
  @IsBoolean()
  public posts?: boolean;
}
