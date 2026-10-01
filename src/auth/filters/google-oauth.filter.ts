import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Sends the browser back to the frontend login page instead of leaving it on a
 * raw JSON/500 screen. Without this, a failed or refreshed Google callback
 * leaves the user stuck on the callback URL, and reloading it replays the
 * (single-use) authorization code, which Google rejects with `invalid_grant`.
 */
@Catch()
export class GoogleOAuthFilter
  implements ExceptionFilter
{
  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const res =
      host.switchToHttp().getResponse<Response>();

    const frontendUrl =
      process.env.FRONTEND_URL ??
      'http://localhost:5173';

    const target =
      new URL(
        '/login',
        frontendUrl,
      );

    let reason = 'google_failed';

    if (exception instanceof HttpException) {
      const status =
        exception.getStatus();

      reason =
        status === 401
          ? 'google_unauthorized'
          : 'google_failed';
    } else if (
      exception instanceof Error &&
      (exception as any).name === 'TokenError'
    ) {
      // passport-oauth2 raises TokenError for invalid_grant / access_denied.
      const oauthError = (exception as any).oauthError;

      if (oauthError === 'access_denied') {
        reason = 'google_cancelled';
      } else if (
        oauthError === 'invalid_grant'
      ) {
        reason = 'google_code_reused';
      } else {
        reason = 'google_failed';
      }
    }

    target.searchParams.set(
      'authError',
      reason,
    );

    res.redirect(
      target.toString(),
    );
  }
}