
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendEmailOtpDto } from './dto/email-otp.dto';

import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleOAuthFilter } from './filters/google-oauth.filter';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';


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
  register(
    @Body() registerDto: RegisterDto,
  ) {
    return this.authService.register(
      registerDto,
    );
  }

  // =====================================================
  // LOGIN
  // =====================================================

  @Post('login')
  login(
    @Body() loginDto: LoginDto,
  ) {
    return this.authService.login(
      loginDto,
    );
  }

  // =====================================================
  // SEND EMAIL OTP
  // =====================================================

  @Post('email-otp/send')
  sendEmailOtp(
    @Body() sendEmailOtpDto: SendEmailOtpDto,
  ) {
    return this.authService.sendEmailOtp(
      sendEmailOtpDto.email,
    );
  }

  @Post('email-otp/verify')
  async verifyEmailOtp(
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

  // @Get('google')
  // @UseGuards(GoogleAuthGuard)
  // googleLogin() {
  //   return;
  // }

  // @Get('google/callback')
  // @UseGuards(GoogleAuthGuard)
  // @UseFilters(GoogleOAuthFilter)
  // async googleCallback(
  //   @Req() req: any,
  //   @Res() res: Response,
  // ) {
  //   const result =
  //     await this.authService.googleLogin(
  //       req.user,
  //     );

  //   const frontendUrl =
  //     this.configService.get<string>(
  //       'FRONTEND_URL',
  //     ) ?? 'http://localhost:5173';

  //   const target =
  //     new URL(
  //       '/login',
  //       frontendUrl,
  //     );

  //   target.searchParams.set(
  //     'token',
  //     String(result.data.accessToken),
  //   );

  //   target.searchParams.set(
  //     'email',
  //     String(result.data.email),
  //   );

  //   if (result.data.name) {
  //     target.searchParams.set(
  //       'name',
  //       String(result.data.name),
  //     );
  //   }

  //   return res.redirect(
  //     target.toString(),
  //   );
  // }

  // =====================================================
  // GOOGLE LOGIN
  // =====================================================

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    return;
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleOAuthFilter)
  async googleCallback(
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.authService.googleLogin(req.user);

    const allowedOrigins = [
      'http://localhost:5173',
      'https://evolve-inky-five.vercel.app',
    ];

    // Origin must be saved and restored by your OAuth guard/session.
    const requestedOrigin =
      req.session?.oauthFrontendOrigin ??
      req.oauthFrontendOrigin;

    const configuredOrigin =
      this.configService.get<string>('FRONTEND_URL') ??
      'https://evolve-inky-five.vercel.app';

    const frontendOrigin = allowedOrigins.includes(requestedOrigin)
      ? requestedOrigin
      : allowedOrigins.includes(configuredOrigin)
        ? configuredOrigin
        : 'https://evolve-inky-five.vercel.app';

    const target = new URL('/login', frontendOrigin);

    target.searchParams.set(
      'token',
      String(result.data.accessToken),
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
  }
}

