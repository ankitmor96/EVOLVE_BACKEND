
import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    ParseIntPipe,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';


@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
    constructor(
        private readonly connectionsService: ConnectionsService,
    ) { }

    // 1. Send connection request
    @Post('request/:userId')
    sendRequest(
        @Req() req: Request & { user: { userId: number } },
        @Param('userId', ParseIntPipe) userId: number,
    ) {
        return this.connectionsService.sendRequest(
            req.user.userId,
            userId,
        );
    }

    // 2. Accept connection request
    @Post(':connectionId/accept')
    acceptRequest(
        @Req() req: Request & { user: { userId: number } },
        @Param('connectionId', ParseIntPipe) connectionId: number,
    ) {
        return this.connectionsService.acceptRequest(
            req.user.userId,
            connectionId,
        );
    }

    // 3. Reject connection request
    @Post(':connectionId/reject')
    rejectRequest(
        @Req() req: Request & { user: { userId: number } },
        @Param('connectionId', ParseIntPipe) connectionId: number,
    ) {
        return this.connectionsService.rejectRequest(
            req.user.userId,
            connectionId,
        );
    }

    // 4. Get received requests
    @Get('requests/received')
    getReceivedRequests(
        @Req() req: Request & { user: { userId: number } },
    ) {
        return this.connectionsService.getReceivedRequests(
            req.user.userId,
        );
    }

    // 5. Get sent requests
    @Get('requests/sent')
    getSentRequests(
        @Req() req: Request & { user: { userId: number } },
    ) {
        return this.connectionsService.getSentRequests(
            req.user.userId,
        );
    }

    // 6. Get accepted connections
    @Get()
    getMyConnections(
        @Req() req: Request & { user: { userId: number } },
    ) {
        return this.connectionsService.getMyConnections(
            req.user.userId,
        );
    }

    // 7. Cancel request or remove connection
    @Delete(':connectionId')
    removeConnection(
        @Req() req: Request & { user: { userId: number } },
        @Param('connectionId', ParseIntPipe) connectionId: number,
    ) {
        return this.connectionsService.removeConnection(
            req.user.userId,
            connectionId,
        );
    }


    // 8. Get another user's accepted connections
    @Get('user/:userId')
    getUserConnections(
        @Param('userId', ParseIntPipe) userId: number,
    ) {
        return this.connectionsService.getUserConnections(userId);
    }

}
