
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendEmailOtpDto } from './dto/email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleOAuthFilter } from './filters/google-oauth.filter';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  // =====================================================
  // REGISTER
  // =====================================================

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // =====================================================
  // LOGIN
  // =====================================================

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // =====================================================
  // SEND EMAIL OTP
  // =====================================================

  @Post('email-otp/send')
  sendEmailOtp(@Body() sendEmailOtpDto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(
      sendEmailOtpDto.email,
    );
  }

  // =====================================================
  // VERIFY EMAIL OTP
  // =====================================================

  @Post('email-otp/verify')
  verifyEmailOtp(
    @Body() verifyEmailOtpDto: VerifyEmailOtpDto,
  ) {
    return this.authService.verifyEmailOtp(
      verifyEmailOtpDto,
    );
  }

  // =====================================================
  // FORGOT PASSWORD
  // =====================================================

  @Post('forgot-password')
  forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(
      forgotPasswordDto,
    );
  }

  // =====================================================
  // RESET PASSWORD
  // =====================================================

  @Post('reset-password')
  resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(
      resetPasswordDto,
    );
  }

  // =====================================================
  // GOOGLE LOGIN
  // =====================================================

  // Start Google OAuth
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Passport redirects the user to Google.
  }

  // Google OAuth callback
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleOAuthFilter)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:5173';

    try {
      const googleUser = req.user as {
        googleId: string;
        email: string;
        name: string;
      };

      const result = await this.authService.googleLogin(
        googleUser,
      );

      const target = new URL('/login', frontendUrl);

      target.searchParams.set(
        'token',
        result.data.accessToken,
      );


      target.searchParams.set(
        'email',
        String(result.data.email),
      );

      if (result.data.name) {
        target.searchParams.set(
          'name',
          String(result.data.name),
        );
      }

      return res.redirect(target.toString());
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        const target = new URL('/login', frontendUrl);

        target.searchParams.set(
          'authError',
          'google_not_registered',
        );

        return res.redirect(target.toString());
      }

      throw error;
    }
  }
}