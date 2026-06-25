import { IsNotEmpty, IsString } from 'class-validator';

export class TranslateMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'convId is required' })
  public convId: string;

  @IsString()
  @IsNotEmpty({ message: 'msgId is required' })
  public msgId: string;

  @IsString()
  @IsNotEmpty({ message: 'targetLang is required' })
  public targetLang: string;
}
