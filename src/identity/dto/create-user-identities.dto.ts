import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
} from 'class-validator';

export class CreateUserIdentitiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  identityTypeIds: number[];

  @IsOptional()
  @IsInt()
  primaryIdentityTypeId?: number;
}