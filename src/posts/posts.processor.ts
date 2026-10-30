import { Processor, WorkerHost } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

interface PostCreatedJob {
  postId: number;
  userId: number;
}

interface ModerationPayload {
  userId: number;
  postId: number;
  postType: string;
  mediaURL: string;
}

@Processor('posts')
export class PostsProcessor extends WorkerHost {
  private readonly redis: Redis;

  private readonly batchKey = 'moderation:posts:batch';

  private readonly processingBatchKey = 'moderation:posts:processing';

  private readonly batchSize = 10;

  private readonly batchDelayMs = 6000;

  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private flushPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationService: ModerationService,
  ) {
    super();

    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
    });
  }

  private async addToModerationBatch(
    payload: ModerationPayload,
  ): Promise<void> {
    await this.redis.rpush(this.batchKey, JSON.stringify(payload));

    const currentSize = await this.redis.llen(this.batchKey);

    if (currentSize >= this.batchSize) {
      this.clearBatchTimer();
      await this.flushModerationBatch();
      return;
    }

    this.scheduleBatchFlush();
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;

      void this.flushModerationBatch().catch((error: unknown) => {
        console.error('Moderation batch flush failed:', error);
      });
    }, this.batchDelayMs);
  }

  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

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
      const pendingCount = await this.redis.llen(this.batchKey);

      if (pendingCount === 0) {
        break;
      }

      const processingKey = `${this.processingBatchKey}:${randomUUID()}`;

      const isTimerFlush = pendingCount < this.batchSize;

      const result = await this.redis.eval(
        script,
        1,
        this.batchKey,
        this.batchSize,
        processingKey,
        isTimerFlush ? 'timer' : 'size',
      );

      const batchItems = Array.isArray(result) ? result.map(String) : [];

      if (batchItems.length === 0) {
        await this.redis.del(processingKey);
        break;
      }

      const batch: ModerationPayload[] = batchItems.map(
        (item) => JSON.parse(item) as ModerationPayload,
      );

      try {
        const response = await this.moderationService.sendBatch(batch);

        console.log('Moderation API response:', response);

        await this.redis.del(processingKey);
      } catch (error) {
        // Sending failed: put the posts back in the queue so they are not lost.
        // Do NOT re-throw: BullMQ would retry the job and add the same post twice.
        console.error('Moderation sendBatch failed, re-queueing posts:', error);

        await this.redis.rpush(this.batchKey, ...batchItems);
        await this.redis.del(processingKey);
        break; // the timer below retries after batchDelayMs
      }

      // Do not claim fewer than 10 remaining posts immediately.
      const remainingCount = await this.redis.llen(this.batchKey);

      if (remainingCount < this.batchSize) {
        break;
      }
    }

    const remainingCount = await this.redis.llen(this.batchKey);

    if (remainingCount > 0) {
      this.scheduleBatchFlush();
    }
  }

  async process(job: Job<PostCreatedJob>): Promise<void> {
    switch (job.name) {
      case 'post-created': {
        const { postId, userId } = job.data;

        const post = await this.prisma.client.orm.public.Post
          .where({ id: postId, userId })
          .first();

        if (!post) {
          throw new Error(`Post ${postId} not found for user ${userId}`);
        }

        await this.prisma.client.orm.public.Notification.create({
          userId,
          type: 'POST_CREATED',
          title: 'Post created successfully',
          message: `Your post #${postId} has been created successfully.`,
        });

        break;
      }

      case 'moderation-post-created': {
        const { postId, userId } = job.data;

        const post = await this.prisma.client.orm.public.Post
          .where({ id: postId, userId })
          .first();

        if (!post) {
          throw new Error(`Post ${postId} not found for user ${userId}`);
        }

        const media = await this.prisma.client.orm.public.PostMedia
          .where((item) => item.postId.eq(postId))
          .orderBy((item) => item.position.asc())
          .first();

        if (!media) {
          throw new Error(`Media not found for post ${postId}`);
        }

        await this.addToModerationBatch({
          userId,
          postId,
          postType: String(post.postType),
          mediaURL: String(media.mediaUrl),
        });

        break;
      }

      default:
        console.warn(`Unknown posts job: ${job.name}`);
    }
  }
}