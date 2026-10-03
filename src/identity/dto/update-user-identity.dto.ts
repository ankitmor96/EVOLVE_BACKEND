import { IsBoolean } from 'class-validator';

export class UpdateUserIdentityDto {
  @IsBoolean()
  isPrimary: boolean;
}