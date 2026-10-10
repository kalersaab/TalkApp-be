import { IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

const VALID_CONTENT_TYPES = ['text', 'image', 'audio', 'video', 'file', 'sticker'] as const;
// const CDN_REGEX = /^https:\/\//; / // tighten to your CDN domain in production

export class CreateConversationDto {
  @IsMongoId({ message: 'targetUserId must be a valid user ID' })
  public targetUserId: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000, { message: 'Content must not exceed 5000 characters' })
  public content: string;

  @IsIn(VALID_CONTENT_TYPES, { message: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` })
  public contentType: (typeof VALID_CONTENT_TYPES)[number];

  // mediaUrl is required when contentType is not 'text'
  @ValidateIf(o => (o as SendMessageDto).contentType !== 'text')
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'mediaUrl must be a valid HTTPS CDN URL' })
  @IsNotEmpty({ message: 'mediaUrl is required for non-text messages' })
  public mediaUrl?: string;
}

export class GetMessagesQueryDto {
  @IsOptional()
  @IsString()
  public beforeMsgId?: string;

  @IsOptional()
  @IsString()
  public limit?: string;
}

export class GetConversationsQueryDto {
  @IsOptional()
  @IsMongoId({ message: 'lastConvId must be a valid conversation ID' })
  public lastConvId?: string;

  @IsOptional()
  @IsString()
  public limit?: string;
}

// ─── Group Chat DTOs ──────────────────────────────────────────────────────────

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  @MaxLength(100, { message: 'Group name must not exceed 100 characters' })
  public name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  public description?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  public avatarUrl?: string;

  @IsMongoId({ each: true, message: 'Each member ID must be valid' })
  @IsNotEmpty({ message: 'At least one member is required' })
  public memberIds: string[];

  @IsOptional()
  public settings?: {
    onlyAdminsCanPost?: boolean;
    approvalRequired?: boolean;
    isPrivate?: boolean;
  };
}

export class AddMembersDto {
  @IsMongoId({ each: true, message: 'Each member ID must be valid' })
  @IsNotEmpty({ message: 'At least one member ID is required' })
  public memberIds: string[];
}

export class RemoveMemberDto {
  @IsMongoId({ message: 'targetUserId must be a valid user ID' })
  public targetUserId: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Group name must not exceed 100 characters' })
  public name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  public description?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  public avatarUrl?: string;

  @IsOptional()
  public settings?: {
    onlyAdminsCanPost?: boolean;
    approvalRequired?: boolean;
    isPrivate?: boolean;
  };
}

export class GetGroupsQueryDto {
  @IsOptional()
  @IsMongoId({ message: 'lastGroupId must be a valid group ID' })
  public lastGroupId?: string;

  @IsOptional()
  @IsString()
  public limit?: string;
}

