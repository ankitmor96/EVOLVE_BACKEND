
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

  // REGISTER
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // LOGIN
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // SEND EMAIL OTP

  @Post('email-otp/send')
  sendEmailOtp(@Body() sendEmailOtpDto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(
      sendEmailOtpDto.email,
      sendEmailOtpDto.mode ?? 'login',
      sendEmailOtpDto.name,
    );
  }


  // VERIFY EMAIL OTP
  @Post('email-otp/verify')
  verifyEmailOtp(
    @Body() verifyEmailOtpDto: VerifyEmailOtpDto,
  ) {
    return this.authService.verifyEmailOtp(
      verifyEmailOtpDto,
    );
  }

  // FORGOT PASSWORD
  @Post('forgot-password')
  forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(
      forgotPasswordDto,
    );
  }

  // RESET PASSWORD
  @Post('reset-password')
  resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(
      resetPasswordDto,
    );
  }

  // START GOOGLE OAUTH
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Passport redirects the user to Google.
  }

  // GOOGLE OAUTH CALLBACK
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleOAuthFilter)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const defaultFrontend =
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:5173';

    const allowedOrigins = (
      this.configService.get<string>(
        'ALLOWED_FRONTEND_ORIGINS',
      ) ?? defaultFrontend
    )
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);

    let returnUrl: string | undefined;
    let mode: string | undefined;

    // Decode OAuth state
    try {
      const state = req.query.state;

      if (typeof state === 'string') {
        const decoded = JSON.parse(
          Buffer.from(state, 'base64url').toString('utf8'),
        );

        returnUrl =
          typeof decoded.returnUrl === 'string'
            ? decoded.returnUrl.replace(/\/$/, '')
            : undefined;

        mode =
          typeof decoded.mode === 'string'
            ? decoded.mode
            : undefined;
      }
    } catch {
      // Invalid state: fall back to the default frontend.
    }

    // Only allow redirects to configured frontend origins.
    const frontendUrl =
      returnUrl && allowedOrigins.includes(returnUrl)
        ? returnUrl
        : defaultFrontend;

    try {
      const googleUser = req.user as {
        googleId: string;
        email: string;
        name: string;
        notRegistered?: boolean;
      };

      if (!googleUser) {
        const target = new URL('/login', frontendUrl);
        target.searchParams.set(
          'authError',
          'google_failed',
        );
        return res.redirect(target.toString());
      }

      const result = await this.authService.googleLogin(
        googleUser,
        mode === 'signup' ? 'signup' : 'login',
      );

      const target = new URL('/login', frontendUrl);

      target.searchParams.set(
        'token',
        result.data.accessToken,
      );

      target.searchParams.set(
        'email',
        String(result.data.email ?? ''),
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
