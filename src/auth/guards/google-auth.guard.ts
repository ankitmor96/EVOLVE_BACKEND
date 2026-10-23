
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    getAuthenticateOptions(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();

        // Do not override state on the Google callback
        if (req.query.code) return {};

        const { returnUrl, mode } = req.query;

        const state = Buffer.from(
            JSON.stringify({ returnUrl, mode }),
        ).toString('base64url');

        return { state };
    }
}
