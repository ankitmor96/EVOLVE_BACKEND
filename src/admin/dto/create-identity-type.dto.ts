import { IsString, Length, Matches } from 'class-validator';

export class CreateIdentityTypeDto {
  @IsString()
  @Length(2, 50)
  name: string;

  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'Slug can contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;
}