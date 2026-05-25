import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class EquipItemDto {
  @IsString()
  @IsNotEmpty({ message: 'itemId is required' })
  public itemId: string;

  @IsIn(['avatarEffect', 'chatBubble', 'chatBackground'], {
    message: "itemType must be 'avatarEffect', 'chatBubble', or 'chatBackground'",
  })
  public itemType: 'avatarEffect' | 'chatBubble' | 'chatBackground';
}
