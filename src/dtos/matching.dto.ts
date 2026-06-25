import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { isValidLanguageCode } from '@utils/languageCodes';
import { registerDecorator, type ValidationOptions } from 'class-validator';

// ─── Custom decorator: validates each element is a valid ISO 639-1 code ───────

function IsISO6391Array(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isISO6391Array',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          return (value as string[]).every(v => isValidLanguageCode(v));
        },
        defaultMessage() {
          return 'All language codes must be valid ISO 639-1 codes';
        },
      },
    });
  };
}

// ─── Nested DTO ───────────────────────────────────────────────────────────────

class AgeRangeDto {
  @IsInt()
  @Min(18, { message: 'Minimum age must be at least 18' })
  public min: number;

  @IsInt()
  @Max(100, { message: 'Maximum age must not exceed 100' })
  public max: number;
}

// ─── Main filter DTO ──────────────────────────────────────────────────────────

export class FindPartnersDto {
  @IsIn(['male', 'female', 'any'], { message: "genderPreference must be 'male', 'female', or 'any'" })
  public genderPreference: 'male' | 'female' | 'any';

  @IsArray()
  @ArrayMinSize(1, { message: 'Provide at least one learning language' })
  @ArrayMaxSize(5, { message: 'Maximum 5 learning languages allowed' })
  @IsISO6391Array({ message: 'All language codes must be valid ISO 639-1 codes' })
  public learningLanguages: string[];

  @IsString()
  @IsNotEmpty()
  public nativeLanguage: string;

  @ValidateNested()
  @Type(() => AgeRangeDto)
  public ageRange: AgeRangeDto;

  @IsBoolean()
  public enableNearby: boolean;

  @ValidateIf(o => (o as FindPartnersDto).enableNearby === true)
  @IsNumber()
  @Min(1, { message: 'proximityKm must be at least 1' })
  @Max(10000, { message: 'proximityKm must not exceed 10000' })
  public proximityKm: number;

  @IsString()
  @IsNotEmpty()
  public proficiencyLevel: string;
}

export class SavePreferencesDto extends FindPartnersDto {}
