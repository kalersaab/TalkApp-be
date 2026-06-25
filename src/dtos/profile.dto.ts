import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateIf, IsUrl, IsNotEmpty } from 'class-validator';

const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const GENDERS = ['male', 'female', 'other'] as const;
const POST_TYPES = ['text', 'image', 'voice'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  public displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  public bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  public nativeLang?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  public learningLangs?: string[];

  @IsOptional()
  @IsObject()
  public proficiencyLevels?: Record<string, (typeof PROFICIENCY_LEVELS)[number]>;

  @IsOptional()
  @IsIn(GENDERS)
  public gender?: (typeof GENDERS)[number];
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  public content: string;

  @IsIn(POST_TYPES, { message: "postType must be 'text', 'image', or 'voice'" })
  public postType: (typeof POST_TYPES)[number];

  @ValidateIf(o => (o as CreatePostDto).postType !== 'text')
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'mediaUrl must be a valid HTTPS URL' })
  @IsNotEmpty({ message: 'mediaUrl is required for image and voice posts' })
  public mediaUrl?: string;
}
