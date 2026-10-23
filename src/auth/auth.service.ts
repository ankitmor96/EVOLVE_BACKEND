
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { Temporal } from '@js-temporal/polyfill';

import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';

import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) { }

  // =====================================================
  // OTP HELPERS
  // =====================================================

  // Keeps at most one OTP row per address: an existing row is overwritten
  // instead of accumulating a new row on every request.
  private async saveOtp(
    email: string,
    otp: string,
    expiresAt: Temporal.Instant,
  ) {
    const existing =
      await this.prisma.client.orm.public.EmailOtp.first(
        { email },
      );

    if (existing) {
      await this.prisma.client.orm.public.EmailOtp
        .where(
          { id: existing.id },
        )
        .update(
          { otp, expiresAt },
        );

      return;
    }

    await this.prisma.client.orm.public.EmailOtp.create(
      { email, otp, expiresAt },
    );
  }

  // Burns an OTP once it has been spent, so the same code cannot be replayed
  // before it expires.
  private async burnOtp(id: number) {
    await this.prisma.client.orm.public.EmailOtp
      .where(
        { id },
      )
      .update(
        {
          expiresAt: Temporal.Instant.fromEpochMilliseconds(
            Date.now() - 1000,
          ),
        },
      );
  }

  // Always resolves the newest OTP, never an older spent one.
  private async latestOtp(email: string) {
    return this.prisma.client.orm.public.EmailOtp
      .where(
        { email },
      )
      .orderBy(
        (otp) => otp.createdAt.desc(),
      )
      .limit(1)
      .first();
  }

  // =====================================================
  // REGISTER
  // =====================================================

  async register(registerDto: RegisterDto) {
    // Normalize so the address matches the OTP flows, which always lowercase.
    const normalizedEmail =
      registerDto.email.trim().toLowerCase();

    const existingUser =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    if (existingUser) {
      throw new ConflictException(
        'User with this email already exists',
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        registerDto.password,
        10,
      );

    const user =
      await this.prisma.client.orm.public.User.create({
        name: registerDto.name,
        email: normalizedEmail,
        password: hashedPassword,
      });

    return {
      message: 'User registered successfully',

      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }

  // =====================================================
  // FORGOT PASSWORD - SEND OTP
  // =====================================================

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    // 1. Normalize email
    const normalizedEmail =
      forgotPasswordDto.email.trim().toLowerCase();

    // 2. Check user
    const user =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    if (!user) {
      throw new UnauthorizedException(
        'No account found with this email.',
      );
    }

    // 3. Generate secure 6-digit OTP
    const otp =
      randomInt(100000, 1000000).toString();

    // 4. OTP expires after 5 minutes
    const expiresAt =
      Temporal.Instant.fromEpochMilliseconds(
        Date.now() + 5 * 60 * 1000,
      );

    // 5. Save OTP
    await this.saveOtp(
      normalizedEmail,
      otp,
      expiresAt,
    );

    // 6. Send OTP
    await this.emailService.sendEmailOtp(
      normalizedEmail,
      otp,
    );

    return {
      message: 'Password reset OTP sent successfully',
    };
  }

  // =====================================================
  // RESET PASSWORD
  // =====================================================

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const normalizedEmail =
      resetPasswordDto.email.trim().toLowerCase();

    const user =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    if (!user) {
      throw new UnauthorizedException(
        'No account found with this email.',
      );
    }

    // Find the newest OTP
    const otpRecord =
      await this.latestOtp(normalizedEmail);

    if (!otpRecord) {
      throw new UnauthorizedException(
        'OTP not found. Please request a new OTP.',
      );
    }

    if (otpRecord.otp !== resetPasswordDto.otp) {
      throw new UnauthorizedException(
        'Invalid OTP',
      );
    }

    const expiresAt = Temporal.Instant.from(
      String(otpRecord.expiresAt),
    );

    if (
      Temporal.Instant.compare(
        expiresAt,
        Temporal.Now.instant(),
      ) < 0
    ) {
      throw new UnauthorizedException(
        'OTP has expired. Please request a new OTP.',
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        resetPasswordDto.newPassword,
        10,
      );

    await this.prisma.client.orm.public.User
      .where({
        id: user.id,
      })
      .update({
        password: hashedPassword,
      });

    // Burn the OTP so the same code cannot reset the password twice.
    await this.burnOtp(Number(otpRecord.id));

    return {
      message: 'Password reset successfully',
    };
  }

  // =====================================================
  // SEND EMAIL OTP
  // =====================================================


  async sendEmailOtp(
    email: string,
    mode: 'login' | 'signup' = 'login',
    name?: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    let user = await this.prisma.client.orm.public.User.first({
      email: normalizedEmail,
    });

    // Login: user must already exist.
    if (!user && mode === 'login') {
      throw new UnauthorizedException(
        'No account found with this email. Please sign up first.',
      );
    }

    // Signup: create a password-less account if it doesn't exist.
    if (!user && mode === 'signup') {
      user = await this.prisma.client.orm.public.User.create({
        email: normalizedEmail,
        name: name?.trim() || normalizedEmail.split('@')[0],
        emailVerified: false,
      });
    }

    // Generate a secure 6-digit OTP.
    const otp = randomInt(100000, 1000000).toString();

    // OTP expires after 5 minutes.
    const expiresAt = Temporal.Instant.fromEpochMilliseconds(
      Date.now() + 5 * 60 * 1000,
    );

    // Save OTP and send it to the user's email.
    await this.saveOtp(normalizedEmail, otp, expiresAt);

    await this.emailService.sendEmailOtp(normalizedEmail, otp);

    // Never return the OTP to the frontend.
    return {
      message: 'OTP sent successfully',
    };
  }


  async verifyEmailOtp(verifyEmailOtpDto: VerifyEmailOtpDto) {
    const normalizedEmail =
      verifyEmailOtpDto.email.trim().toLowerCase();

    const user = await this.prisma.client.orm.public.User.first({
      email: normalizedEmail,
    });

    if (!user) {
      throw new UnauthorizedException(
        'No account found with this email. Please sign up first.',
      );
    }

    const otpRecord = await this.latestOtp(normalizedEmail);

    if (!otpRecord) {
      throw new UnauthorizedException(
        'OTP not found. Please request a new OTP.',
      );
    }

    if (otpRecord.otp !== verifyEmailOtpDto.otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const expiresAt = Temporal.Instant.from(
      String(otpRecord.expiresAt),
    );

    if (
      Temporal.Instant.compare(
        expiresAt,
        Temporal.Now.instant(),
      ) < 0
    ) {
      throw new UnauthorizedException(
        'OTP has expired. Please request a new OTP.',
      );
    }

    await this.prisma.client.orm.public.User
      .where({ id: user.id })
      .update({ emailVerified: true });

    await this.burnOtp(Number(otpRecord.id));

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      message: 'Email OTP verification successful',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: true,
        accessToken,
      },
    };
  }


  async login(loginDto: LoginDto) {
    const normalizedEmail = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.client.orm.public.User.first({
      email: normalizedEmail,
    });

    if (!user || !user.password) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      String(user.password),
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      message: 'Login successful',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        accessToken,
      },
    };
  }


  // =====================================================
  // GOOGLE LOGIN
  // =====================================================



  async googleLogin(
    googleUser: {
      googleId?: string;
      email?: string;
      name?: string;
      picture?: string;
    },
  ) {
    const normalizedEmail = googleUser.email?.trim().toLowerCase();

    if (!normalizedEmail || !googleUser.googleId) {
      throw new UnauthorizedException(
        'Google account email could not be verified.',
      );
    }

    // Step 1: Find registered user
    const existingUser =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    // Step 2: If user is not registered, stop login
    if (!existingUser) {
      throw new UnauthorizedException(
        'Account not registered. Please register first.',
      );
    }

    // Step 3: Verify existing Google account link
    if (
      existingUser.googleId &&
      existingUser.googleId !== googleUser.googleId
    ) {
      throw new UnauthorizedException(
        'This account is linked to a different Google account.',
      );
    }

    // Step 4: Link Google ID to an existing account

    let user = existingUser;

    if (!existingUser.googleId) {
      await this.prisma.client.orm.public.User
        .where({ id: existingUser.id })
        .update({
          googleId: googleUser.googleId,
          emailVerified: true,
        });

      // Keep the already verified existing user object.
      user = {
        ...existingUser,
        googleId: googleUser.googleId,
        emailVerified: true,
      };
    }

    // Step 5: Generate JWT only after user is confirmed
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      success: true,
      message: 'Google login successful',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        accessToken,
      },
    };
  }
}

