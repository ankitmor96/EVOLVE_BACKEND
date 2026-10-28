
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
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

  private async saveOtp(
    email: string,
    otp: string,
    expiresAt: Temporal.Instant,
  ) {
    const existing =
      await this.prisma.client.orm.public.EmailOtp.first({
        email,
      });

    if (existing) {
      await this.prisma.client.orm.public.EmailOtp
        .where({ id: existing.id })
        .update({ otp, expiresAt });

      return;
    }

    await this.prisma.client.orm.public.EmailOtp.create({
      email,
      otp,
      expiresAt,
    });
  }

  private async burnOtp(id: number) {
    await this.prisma.client.orm.public.EmailOtp
      .where({ id })
      .update({
        expiresAt: Temporal.Instant.fromEpochMilliseconds(
          Date.now() - 1000,
        ),
      });
  }

  private async latestOtp(email: string) {
    return this.prisma.client.orm.public.EmailOtp
      .where({ email })
      .orderBy((otp) => otp.createdAt.desc())
      .limit(1)
      .first();
  }

  // =====================================================
  // REGISTER WITH PASSWORD
  // =====================================================

  async register(registerDto: RegisterDto) {
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

    const hashedPassword = await bcrypt.hash(
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

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ) {
    const normalizedEmail =
      forgotPasswordDto.email.trim().toLowerCase();

    const user =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    if (!user) {
      throw new UnauthorizedException(
        'No account found with this email.',
      );
    }

    const otp = randomInt(100000, 1000000).toString();

    const expiresAt =
      Temporal.Instant.fromEpochMilliseconds(
        Date.now() + 5 * 60 * 1000,
      );

    await this.saveOtp(
      normalizedEmail,
      otp,
      expiresAt,
    );

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

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ) {
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

    const otpRecord =
      await this.latestOtp(normalizedEmail);

    if (!otpRecord) {
      throw new UnauthorizedException(
        'OTP not found. Please request a new OTP.',
      );
    }

    if (otpRecord.otp !== resetPasswordDto.otp) {
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

    const hashedPassword = await bcrypt.hash(
      resetPasswordDto.newPassword,
      10,
    );

    await this.prisma.client.orm.public.User
      .where({ id: user.id })
      .update({ password: hashedPassword });

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

    if (!normalizedEmail) {
      throw new UnauthorizedException(
        'Email is required.',
      );
    }

    // Find an existing account.
    let user =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    // Automatically create an account if this email is new.
    // OTP verification is still required before login.
    if (!user) {
      user =
        await this.prisma.client.orm.public.User.create({
          email: normalizedEmail,
          name:
            name?.trim() ||
            normalizedEmail.split('@')[0],
          emailVerified: false,
        });
    }

    // Generate a secure six-digit OTP.
    const otp = randomInt(100000, 1000000).toString();

    const expiresAt =
      Temporal.Instant.fromEpochMilliseconds(
        Date.now() + 5 * 60 * 1000,
      );

    await this.saveOtp(
      normalizedEmail,
      otp,
      expiresAt,
    );

    await this.emailService.sendEmailOtp(
      normalizedEmail,
      otp,
    );

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  // =====================================================
  // VERIFY EMAIL OTP AND LOGIN
  // =====================================================

  async verifyEmailOtp(
    verifyEmailOtpDto: VerifyEmailOtpDto,
  ) {
    const normalizedEmail =
      verifyEmailOtpDto.email.trim().toLowerCase();

    const user =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    if (!user) {
      throw new UnauthorizedException(
        'Account not found. Please request a new OTP.',
      );
    }

    const otpRecord =
      await this.latestOtp(normalizedEmail);

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

    // Verify the email only after successful OTP verification.
    await this.prisma.client.orm.public.User
      .where({ id: user.id })
      .update({ emailVerified: true });

    // OTP can only be used once.
    await this.burnOtp(Number(otpRecord.id));

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      success: true,
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

  // =====================================================
  // LOGIN WITH EMAIL AND PASSWORD
  // =====================================================

  async login(loginDto: LoginDto) {
    const normalizedEmail =
      loginDto.email.trim().toLowerCase();

    const user =
      await this.prisma.client.orm.public.User.first({
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
  // GOOGLE LOGIN / SIGNUP
  // =====================================================

  async googleLogin(
    googleUser: {
      googleId?: string;
      email?: string;
      name?: string;
      picture?: string;
    },
    mode: 'login' | 'signup' = 'login',
  ) {
    const normalizedEmail =
      googleUser.email?.trim().toLowerCase();

    if (!normalizedEmail || !googleUser.googleId) {
      throw new UnauthorizedException(
        'Google account email could not be verified.',
      );
    }

    const existingUser =
      await this.prisma.client.orm.public.User.first({
        email: normalizedEmail,
      });

    let user = existingUser;

    // Automatically create a user for a new Google account.
    // Google OAuth must have successfully verified the identity.
    if (!existingUser) {
      user =
        await this.prisma.client.orm.public.User.create({
          email: normalizedEmail,
          name:
            googleUser.name?.trim() ||
            normalizedEmail.split('@')[0],
          googleId: googleUser.googleId,
          emailVerified: true,
        });
    } else {
      // Reject a conflicting Google ID already linked to this email.
      if (
        existingUser.googleId &&
        existingUser.googleId !== googleUser.googleId
      ) {
        throw new UnauthorizedException(
          'This account is linked to a different Google account.',
        );
      }

      // Link Google to an existing account that has no Google ID.
      if (!existingUser.googleId) {
        await this.prisma.client.orm.public.User
          .where({ id: existingUser.id })
          .update({
            googleId: googleUser.googleId,
            emailVerified: true,
          });

        user = {
          ...existingUser,
          googleId: googleUser.googleId,
          emailVerified: true,
        };
      }
    }

    if (!user) {
      throw new UnauthorizedException(
        'Unable to create or find Google account.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

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


  // DELETE ACCOUNT
  async deleteAccount(userId: number) {
    const user = await this.prisma.client.orm.public.User
      .where({ id: userId })
      .first();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Save the user's conversation IDs before deleting the account.
    const participants =
      await this.prisma.client.orm.public.ConversationParticipant
        .where({ userId })
        .all();

    const conversationIds = [
      ...new Set(
        participants.map((participant) =>
          Number(participant.conversationId),
        ),
      ),
    ];

    // Delete notifications received by this user.
    await this.prisma.client.orm.public.Notification
      .where({ userId })
      .delete();

    // Delete OTP records associated with this user's email.
    await this.prisma.client.orm.public.EmailOtp
      .where({ email: user.email })
      .delete();

    // Delete the user.

    await this.prisma.client.orm.public.User
      .where({ id: userId })
      .delete();

    // Remove conversations that no longer have any participants.
    for (const conversationId of conversationIds) {
      const remainingParticipants =
        await this.prisma.client.orm.public.ConversationParticipant
          .where({ conversationId })
          .all();

      if (remainingParticipants.length === 0) {
        await this.prisma.client.orm.public.Message
          .where({ conversationId })
          .delete();

        await this.prisma.client.orm.public.Conversation
          .where({ id: conversationId })
          .delete();
      }
    }

    return {
      success: true,
      message: 'Your account and associated data have been deleted',
    };
  }


}
