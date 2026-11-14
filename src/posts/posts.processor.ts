import { Processor, WorkerHost } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { VideoModerationPipelineService } from '../database-moderation/video/video-moderation-pipeline.service';

interface PostCreatedJob {
  postId: number;
  userId: number;
}

interface ModerationPayload {
  moderationId: number;
  userId: number;
  postId: number;
  postType: string;
  mediaURL: string;
}

@Processor('posts')
export class PostsProcessor extends WorkerHost {
  private readonly redis: Redis;

  private readonly batchKey = 'moderation:posts:batch';

  private readonly processingBatchKey =
    'moderation:posts:processing';

  private readonly batchSize = 10;

  private readonly batchDelayMs = 6000;

  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private flushPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationService: ModerationService,
    private readonly videoModerationPipeline: VideoModerationPipelineService,
  ) {
    super();

    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
    });
  }

  // ==========================================
  // GET OR CREATE MODERATION RECORD
  // ==========================================

  private async getOrCreateModerationId(
    postId: number,
    userId: number,
    postType: string,
    mediaURL: string,
  ): Promise<number> {
    const existingResult =
      await this.prisma.client.orm.public.ModerationResult
        .where({ postId })
        .first();

    if (existingResult) {
      if (existingResult.userId !== userId) {
        throw new Error(
          `Moderation record owner mismatch for post ${postId}`,
        );
      }

      return Number(existingResult.id);
    }

    const moderationResult =
      await this.prisma.client.orm.public.ModerationResult
        .create({
          postId,
          userId,
          postType,
          mediaUrl: mediaURL,
          moderation_status: 'PENDING',
          categories: [],
          reasons: [],
        });

    console.log('Moderation record created:', {
      moderationId: moderationResult.id,
      postId,
      userId,
    });

    return Number(moderationResult.id);
  }

  // ==========================================
  // ADD TO MODERATION BATCH
  // ==========================================

  private async addToModerationBatch(
    payload: ModerationPayload,
  ): Promise<void> {
    await this.redis.rpush(
      this.batchKey,
      JSON.stringify(payload),
    );

    const currentSize = await this.redis.llen(
      this.batchKey,
    );

    if (currentSize >= this.batchSize) {
      this.clearBatchTimer();
      await this.flushModerationBatch();
      return;
    }

    this.scheduleBatchFlush();
  }

  // ==========================================
  // SCHEDULE BATCH FLUSH
  // ==========================================

  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;

      void this.flushModerationBatch().catch(
        (error: unknown) => {
          console.error(
            'Moderation batch flush failed:',
            error,
          );
        },
      );
    }, this.batchDelayMs);
  }

  // ==========================================
  // CLEAR BATCH TIMER
  // ==========================================

  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // ==========================================
  // FLUSH MODERATION BATCH
  // ==========================================

  private async flushModerationBatch(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.claimAvailableBatches();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  // ==========================================
  // CLAIM AND SEND BATCHES
  // ==========================================

  private async claimAvailableBatches(): Promise<void> {
    const script = `
      local count = redis.call('LLEN', KEYS[1])
      local batchSize = tonumber(ARGV[1])

      if count < batchSize and ARGV[3] ~= 'timer' then
        return {}
      end

      local claimCount = math.min(batchSize, count)

      for i = 1, claimCount do
        redis.call('RPOPLPUSH', KEYS[1], ARGV[2])
      end

      return redis.call('LRANGE', ARGV[2], 0, -1)
    `;

    while (true) {
      const pendingCount = await this.redis.llen(
        this.batchKey,
      );

      if (pendingCount === 0) {
        break;
      }

      const processingKey =
        `${this.processingBatchKey}:${randomUUID()}`;

      const isTimerFlush =
        pendingCount < this.batchSize;

      const result = await this.redis.eval(
        script,
        1,
        this.batchKey,
        this.batchSize,
        processingKey,
        isTimerFlush ? 'timer' : 'size',
      );

      const batchItems = Array.isArray(result)
        ? result.map(String)
        : [];

      if (batchItems.length === 0) {
        await this.redis.del(processingKey);
        break;
      }

      const batch: ModerationPayload[] =
        batchItems.map(
          (item) =>
            JSON.parse(item) as ModerationPayload,
        );

      try {
        const response =
          await this.moderationService.sendBatch(batch);

        console.log(
          'Moderation API response:',
          response,
        );

        await this.redis.del(processingKey);
      } catch (error) {
        console.error(
          'Moderation sendBatch failed, re-queueing posts:',
          error,
        );

        await this.redis.rpush(
          this.batchKey,
          ...batchItems,
        );

        await this.redis.del(processingKey);
        break;
      }

      const remainingCount = await this.redis.llen(
        this.batchKey,
      );

      if (remainingCount < this.batchSize) {
        break;
      }
    }

    const remainingCount = await this.redis.llen(
      this.batchKey,
    );

    if (remainingCount > 0) {
      this.scheduleBatchFlush();
    }
  }

  // ==========================================
  // PROCESS BULLMQ JOBS
  // ==========================================

  async process(job: Job<PostCreatedJob>): Promise<void> {
    switch (job.name) {
      // ======================================
      // POST CREATED
      // ======================================

      case 'post-created': {
        const { postId, userId } = job.data;

        const post =
          await this.prisma.client.orm.public.Post
            .where({ id: postId, userId })
            .first();

        if (!post) {
          throw new Error(
            `Post ${postId} not found for user ${userId}`,
          );
        }

        await this.prisma.client.orm.public.Notification
          .create({
            userId,
            type: 'POST_CREATED',
            title: 'Post created successfully',
            message:
              `Your post #${postId} has been created successfully.`,
          });

        break;
      }

      // ======================================
      // MODERATION POST CREATED
      // ======================================

      case 'moderation-post-created': {
        const { postId, userId } = job.data;

        const post =
          await this.prisma.client.orm.public.Post
            .where({ id: postId, userId })
            .first();

        if (!post) {
          throw new Error(
            `Post ${postId} not found for user ${userId}`,
          );
        }

        // Prevent VIDEO posts from entering generic moderation flow
        if (post.postType === 'VIDEO') {
          console.warn(
            `Skipping VIDEO post ${postId} in generic moderation flow`,
          );
          break;
        }

        const media =
          await this.prisma.client.orm.public.PostMedia
            .where((item) => item.postId.eq(postId))
            .orderBy((item) => item.position.asc())
            .first();

        if (!media) {
          throw new Error(
            `Media not found for post ${postId}`,
          );
        }

        const postType = String(post.postType);
        const mediaURL = String(media.mediaUrl);

        // Get moderationId from database.
        const moderationId =
          await this.getOrCreateModerationId(
            postId,
            userId,
            postType,
            mediaURL,
          );

        // Add all five fields to Redis batch.
        await this.addToModerationBatch({
          moderationId,
          userId,
          postId,
          postType,
          mediaURL,
        });

        console.log(
          'Post added to moderation batch:',
          {
            moderationId,
            userId,
            postId,
            postType,
            mediaURL,
          },
        );

        break;
      }

      // ======================================
      // VIDEO MODERATION CREATED
      // ======================================



      case 'video-moderation-created': {
        const { postId, userId } = job.data;

        // 1. Validate post
        const post =
          await this.prisma.client.orm.public.Post
            .where({ id: postId, userId })
            .first();

        if (!post) {
          throw new Error(
            `Video post ${postId} not found for user ${userId}`,
          );
        }

        if (post.postType !== 'VIDEO') {
          throw new Error(
            `Post ${postId} is not a VIDEO post`,
          );
        }

        // 2. Get video media
        const media =
          await this.prisma.client.orm.public.PostMedia
            .where((item) => item.postId.eq(postId))
            .orderBy((item) => item.position.asc())
            .first();

        if (!media || media.mediaType !== 'VIDEO') {
          throw new Error(
            `Video media not found for post ${postId}`,
          );
        }

        // 3. Get existing video moderation record
        let videoResult =
          await this.prisma.client.orm.public.VideoModerationResult
            .where({ postId })
            .first();

        if (videoResult) {
          if (videoResult.userId !== userId) {
            throw new Error(
              `Video moderation owner mismatch for post ${postId}`,
            );
          }

          // Already completed: prevent duplicate processing
          if (videoResult.processingStatus === 'COMPLETED') {
            console.log(
              `Video moderation already completed for post ${postId}`,
            );
            break;
          }
        } else {
          // 4. Create moderation record
          videoResult =
            await this.prisma.client.orm.public.VideoModerationResult
              .create({
                postId,
                userId,
                videoUrl: String(media.mediaUrl),
                processingStatus: 'QUEUED',
                finalStatus: 'PENDING',
                frameModerationResult: null,
                audioTranscript: null,
                audioModerationResult: null,
                reasons: [],
              });

          console.log(
            `Video moderation record created: ${videoResult.id}`,
          );
        }

        // 5. Update processing status
        await this.prisma.client.orm.public.VideoModerationResult
          .where({ postId, userId })
          .update({
            processingStatus: 'PROCESSING',
          });

        console.log(
          `Video moderation started for post ${postId}`,
        );

        try {
          // 6. Execute video moderation pipeline
          const summary =
            await this.videoModerationPipeline.processVideo(
              postId,
              userId,
              String(media.mediaUrl),
            );

          // 7. Log moderation summary
          console.log(
            `Video moderation pipeline completed for post ${postId}`,
            {
              finalStatus: summary.finalStatus,
              totalFrames: summary.frameResults.length,
              audioModerated: summary.audioResult !== null,
              reasons: summary.reasons,
            },
          );

          // 8. Save video moderation result
          await this.prisma.client.orm.public.VideoModerationResult
            .where({ postId, userId })
            .update({
              frameModerationResult: summary.frameResults,
              audioTranscript: summary.audioResult?.transcript ?? null,
              audioModerationResult: summary.audioResult,
              reasons: summary.reasons,
              finalStatus: summary.finalStatus,
              processingStatus: 'COMPLETED',
            });

          console.log(
            `Video moderation result saved for post ${postId}`,
          );

          // 9. Update main Post moderation status
          await this.prisma.client.orm.public.Post
            .where({ id: postId, userId })
            .update({
              moderation_status: summary.finalStatus,
            });

          console.log(
            `Post moderation status updated to ${summary.finalStatus} for post ${postId}`,
          );

        } catch (error) {
          // 10. Handle BullMQ retry
          const maxAttempts = job.opts.attempts ?? 1;

          const isFinalAttempt =
            job.attemptsMade + 1 >= maxAttempts;

          console.error(
            `Video moderation failed for post ${postId}`,
            {
              attempt: job.attemptsMade + 1,
              maxAttempts,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );

          // Only mark FAILED after all retries are exhausted
          if (isFinalAttempt) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : String(error);

            await this.prisma.client.orm.public.VideoModerationResult
              .where({ postId, userId })
              .update({
                processingStatus: 'FAILED',
                finalStatus: 'REVIEW',
                reasons: [
                  `Video moderation failed: ${errorMessage}`,
                ],
              });

            await this.prisma.client.orm.public.Post
              .where({ id: postId, userId })
              .update({
                moderation_status: 'REVIEW',
              });

            console.error(
              `Video moderation permanently failed for post ${postId}`,
            );
          } else {
            console.log(
              `Video moderation will be retried for post ${postId}`,
            );
          }

          // Important: BullMQ needs this error to trigger retry
          throw error;
        }

        break;
      }


      default:
        console.warn(
          `Unknown posts job: ${job.name}`,
        );
    }
  }
}