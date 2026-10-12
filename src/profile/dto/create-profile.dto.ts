
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  IsArray,
  IsInt,
  ArrayMinSize,
} from 'class-validator';

export class CreateProfileDto {
  // USERNAME
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username can contain only lowercase letters, numbers, and underscores',
  })
  username: string;


  // COUNTRY
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'Country code must be a 2-letter uppercase code',
  })
  countryCode: string;

  // AGE RANGE
  @IsString()
  @MaxLength(20)
  ageRange: string;

  // BIO
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  // IDENTITY TYPES
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map(Number);
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number) : value;
      } catch {
        return [Number(value)];
      }
    }

    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  identityTypeIds: number[];

  // PRIMARY IDENTITY
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  primaryIdentityTypeId?: number;
}
