
import {
    Controller,
    Get,
    Patch,
    Param,
    ParseIntPipe,
    Req,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';

interface AuthenticatedRequest extends Request {
    user: {
        userId: number | string;
        email: string;
        role: string;
    };
}

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
    ) { }

    private getUserId(req: AuthenticatedRequest): number {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return userId;
    }

    // GET: Logged-in user's notifications
    @Get()
    async getMyNotifications(
        @Req() req: AuthenticatedRequest,
    ) {
        const userId = this.getUserId(req);

        return {
            success: true,
            notifications:
                await this.notificationsService.getMyNotifications(
                    userId,
                ),
        };
    }

    // PATCH: Mark a notification as read
    @Patch(':id/read')
    async markAsRead(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) notificationId: number,
    ) {
        const userId = this.getUserId(req);

        return this.notificationsService.markAsRead(
            userId,
            notificationId,
        );
    }
}
