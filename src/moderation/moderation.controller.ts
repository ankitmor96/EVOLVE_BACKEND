import {
    Body,
    Controller,
    Post,
    Get,
    BadRequestException,
} from '@nestjs/common';

import { ModerationService } from './moderation.service';
import type { ModerationBatchPayload } from './moderation.service';

@Controller('moderation')
export class ModerationController {
    constructor(
        private readonly moderationService: ModerationService,
    ) { }

    @Get('last-batch')
    async getLastBatch() {
        return this.moderationService.getLastBatch();
    }

    @Post('batch')
    async receiveBatch(
        @Body() payload?: ModerationBatchPayload,
    ) {
        // Postman માં body ન હોય તો છેલ્લો batch બતાવશે
        if (!payload || !Array.isArray(payload.posts)) {
            return this.moderationService.getLastBatch();
        }

        const batch = this.moderationService.prepareBatch(
            payload.posts,
        );

        await this.moderationService.saveLastBatch(batch);

        return batch;
    }
}