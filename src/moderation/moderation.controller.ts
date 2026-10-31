import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
  async batch(
    @Body() payload?: ModerationBatchPayload,
    @Query('limit') limit?: string,
  ) {
    if (
      payload &&
      Array.isArray(payload.posts) &&
      payload.posts.length > 0
    ) {
      return this.moderationService.enqueue(payload.posts);
    }

    return this.moderationService.dequeue(
      Number(limit) || 10,
    );
  }

  @Post('result')
  async receiveModerationResult(
    @Body() results: any[],
  ) {
    return this.moderationService.saveModerationResults(
      results,
    );
  }
}