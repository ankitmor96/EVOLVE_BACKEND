import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ModerationService } from './moderation.service';
import type { ModerationBatchPayload } from './moderation.service';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('last-batch')
  async getLastBatch() {
    return this.moderationService.getLastBatch();
  }

  @Post('batch')
  async batch(
    @Body() payload?: ModerationBatchPayload,
    @Query('limit') limit?: string,
  ) {
    // Called by PostsProcessor with a body -> add the posts to the queue
    if (payload && Array.isArray(payload.posts) && payload.posts.length > 0) {
      return this.moderationService.enqueue(payload.posts);
    }

    // Called by the model (Colab) with no body -> hand out up to 10 posts and remove them from the queue
    return this.moderationService.dequeue(Number(limit) || 10);
  }
}