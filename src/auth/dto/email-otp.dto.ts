import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class SendEmailOtpDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['login', 'signup'])
  mode?: 'login' | 'signup';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'OTP must contain exactly 6 digits',
  })
  otp: string;
}