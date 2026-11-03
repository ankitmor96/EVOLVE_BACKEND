import {
    Controller,
    Post,
    Get,
    Body,
    Query,
    Req,
    UseGuards,
    UnauthorizedException,
    BadRequestException,
} from '@nestjs/common';

import { LearningService } from './learning.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { StartTrackingDto } from './dto/start-tracking.dto';
import { ProgressTrackingDto } from './dto/progress-tracking.dto';
import { EndTrackingDto } from './dto/end-tracking.dto';

@Controller('v1/learning')
@UseGuards(JwtAuthGuard)
export class LearningController {

    constructor(
        private readonly learningService: LearningService,
    ) { }

    // =========================================
    // START TRACKING
    // POST /api/v1/learning/track/start
    // =========================================

    @Post('track/start')
    async startTracking(
        @Body() dto: StartTrackingDto,
        @Req() req: any,
    ) {

        const userId = Number(req.user?.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        console.log('DTO:', dto);
        console.log('Post ID:', dto.postId, typeof dto.postId);

        return this.learningService.startTracking(
            userId,
            Number(dto.postId),
        );
    }

    // =========================================
    // TRACK PROGRESS
    // POST /api/v1/learning/track/progress
    // =========================================

    @Post('track/progress')
    async trackProgress(
        @Body() dto: ProgressTrackingDto,
        @Req() req: any,
    ) {

        const userId = Number(req.user?.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.learningService.trackProgress(
            userId,
            dto,
        );
    }

    // =========================================
    // END TRACKING
    // POST /api/v1/learning/track/end
    // =========================================

    @Post('track/end')
    async endTracking(
        @Body() dto: EndTrackingDto,
        @Req() req: any,
    ) {

        const userId = Number(req.user?.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.learningService.endTracking(
            userId,
            dto.sessionId,
        );
    }

    // =========================================
    // LEARNING OVERVIEW
    // GET /api/v1/learning/overview
    // =========================================

    @Get('overview')
    async getOverview(
        @Req() req: any,
        @Query('period') period: string = 'month',
    ) {

        const userId = Number(req.user?.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        if (
            period !== 'month' &&
            period !== 'all'
        ) {
            throw new BadRequestException(
                'period must be month or all',
            );
        }

        return this.learningService.getOverview(
            userId,
            period,
        );
    }
}