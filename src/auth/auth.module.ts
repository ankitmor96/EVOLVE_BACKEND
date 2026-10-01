import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';

import { AuthController } from './auth.controller';

import { GoogleStrategy } from './strategies/google.strategy';

import { GoogleAuthGuard } from './guards/google-auth.guard';

import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    JwtModule.register({
      secret: 'evolv-secret-key',

      signOptions: {
        expiresIn: '1h',
      },
    }),

    EmailModule,
  ],

  providers: [
    AuthService,
    GoogleStrategy,
    GoogleAuthGuard,
  ],

  controllers: [
    AuthController,
  ],
})
export class AuthModule {}