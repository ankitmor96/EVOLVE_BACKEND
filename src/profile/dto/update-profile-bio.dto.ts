import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProfileBioDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;
}