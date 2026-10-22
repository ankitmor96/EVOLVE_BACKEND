
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(
  Strategy,
  'google',
) {
  constructor(
    private readonly configService: ConfigService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>(
        'GOOGLE_CLIENT_SECRET',
      )!,
      callbackURL: configService.get<string>(
        'GOOGLE_CALLBACK_URL',
      )!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const email = profile.emails?.[0]?.value;
    const emailVerified = (
      profile._json as { email_verified?: boolean }
    ).email_verified;

    if (!email || emailVerified !== true) {
      throw new UnauthorizedException(
        'A verified Google email is required.',
      );
    }

    return {
      googleId: profile.id,
      email: email.trim().toLowerCase(),
      name: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      picture: profile.photos?.[0]?.value,
    };
  }
}