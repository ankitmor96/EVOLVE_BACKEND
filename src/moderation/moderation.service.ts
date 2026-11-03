import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';

import Redis from 'ioredis';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';

// ==========================================
// TYPES
// ==========================================

export interface ModerationPostPayload {
  moderationId: number;
  userId: number;
  postId: number;
  postType: string;
  mediaURL: string;
}

export interface ModerationBatchPayload {
  posts: ModerationPostPayload[];
  totalPosts: number;
}

type ModerationStatus =
  | 'APPROVED'
  | 'REJECTED'
  | 'REVIEW';

export interface ModerationResultPayload {
  moderationId: number;
  postId: number;
  userId: number;
  postType: string;
  mediaUrl: string;
  moderation_status: ModerationStatus;
  categories?: string[];
  reasons?: string[];
}

type RedisStreamEntry = [string, string[]];

type RedisAutoClaimResponse = [
  string,
  RedisStreamEntry[],
  string[],
];

// ==========================================
// MODERATION SERVICE
// ==========================================

@Injectable()
export class ModerationService
  implements OnModuleInit, OnModuleDestroy {

  // ========================================
  // REDIS CONNECTION
  // ========================================

  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: 3,
  });

  // ========================================
  // REDIS KEYS
  // ========================================

  private readonly streamKey =
    'evolv:moderation:requests';

  private readonly consumerGroup =
    'moderation:posts:group';

  private readonly consumerName =
    process.env.MODERATION_CONSUMER_NAME ||
    'moderation-worker-1';

  private readonly lastBatchKey =
    'moderation:posts:last-response';

  private readonly processingKey =
    'evolv:moderation:processing';

  private readonly retryKey =
    'evolv:moderation:retries';

  private readonly deadLetterKey =
    'evolv:moderation:dead-letter';

  // ========================================
  // REDIS CONFIGURATION
  // ========================================

  // Initial attempt + maximum 3 retries
  private readonly maxRetries = 3;

  // Pending message idle time before recovery
  private readonly claimIdleMs =
    Number(process.env.MODERATION_CLAIM_IDLE_MS) ||
    300000;

  // XAUTOCLAIM scan cursor
  private claimCursor = '0-0';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) { }

  // ========================================
  // MODULE INITIALIZATION
  // ========================================

  async onModuleInit(): Promise<void> {
    await this.ensureConsumerGroup();
  }

  private async ensureConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.streamKey,
        this.consumerGroup,
        '0',
        'MKSTREAM',
      );

      console.log(
        'Redis Consumer Group created successfully',
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('BUSYGROUP')
      ) {
        console.log(
          'Redis Consumer Group already exists',
        );

        return;
      }

      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  // ========================================
  // PREPARE BATCH
  // ========================================

  prepareBatch(
    posts: ModerationPostPayload[],
  ): ModerationBatchPayload {
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new BadRequestException(
        'Batch must contain at least one post',
      );
    }

    return {
      posts,
      totalPosts: posts.length,
    };
  }

  // ========================================
  // SAVE LAST BATCH
  // ========================================

  async saveLastBatch(
    batch: ModerationBatchPayload,
  ): Promise<void> {
    await this.redis.set(
      this.lastBatchKey,
      JSON.stringify(batch),
    );
  }

  // ========================================
  // GET LAST BATCH
  // ========================================

  async getLastBatch(): Promise<ModerationBatchPayload> {
    const data = await this.redis.get(
      this.lastBatchKey,
    );

    if (!data) {
      throw new NotFoundException(
        'No moderation batch received yet',
      );
    }

    return JSON.parse(data) as ModerationBatchPayload;
  }

  // ========================================
  // STEP 1: ENQUEUE USING XADD
  // ========================================

  async enqueue(
    posts: ModerationPostPayload[],
  ): Promise<ModerationBatchPayload> {
    const batch = this.prepareBatch(posts);

    const pipeline = this.redis.pipeline();

    for (const post of batch.posts) {
      pipeline.xadd(
        this.streamKey,
        '*',
        'data',
        JSON.stringify(post),
      );
    }

    const results = await pipeline.exec();

    if (
      !results ||
      results.some(([error]) => error !== null)
    ) {
      throw new Error(
        'Failed to enqueue moderation posts',
      );
    }

    await this.saveLastBatch(batch);

    console.log(
      `Enqueued ${batch.totalPosts} moderation posts`,
    );

    return batch;
  }

  // ========================================
  // PARSE REDIS STREAM MESSAGE
  // ========================================

  private parseStreamEntry(
    entry: RedisStreamEntry,
  ): ModerationPostPayload {
    const [streamId, fields] = entry;

    const dataIndex = fields.indexOf('data');

    if (
      dataIndex === -1 ||
      !fields[dataIndex + 1]
    ) {
      throw new Error(
        `Invalid Redis Stream message: ${streamId}`,
      );
    }

    const post = JSON.parse(
      fields[dataIndex + 1],
    ) as ModerationPostPayload;

    if (
      !Number.isInteger(post.moderationId) ||
      post.moderationId <= 0 ||
      !Number.isInteger(post.postId) ||
      !Number.isInteger(post.userId) ||
      !post.postType ||
      !post.mediaURL
    ) {
      throw new Error(
        `Invalid post payload in Stream: ${streamId}`,
      );
    }

    return post;
  }

  // ========================================
  // SAVE PROCESSING REFERENCE
  // ========================================

  /*
    postId -> streamId mapping

    AI result comes with postId.
    We use this mapping to find the original
    Redis Stream message and ACK it after DB save.

    This assumes only one active moderation
    message per postId at a time.
  */

  private async saveProcessingReference(
    entries: RedisStreamEntry[],
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const pipeline = this.redis.pipeline();

    for (const [streamId, fields] of entries) {
      const post = this.parseStreamEntry([
        streamId,
        fields,
      ]);

      pipeline.hset(
        this.processingKey,
        String(post.postId),
        streamId,
      );
    }

    const results = await pipeline.exec();

    if (
      !results ||
      results.some(([error]) => error !== null)
    ) {
      throw new Error(
        'Failed to save processing references',
      );
    }
  }

  // ========================================
  // STEP 5: RECOVER PENDING USING XAUTOCLAIM
  // ========================================

  private async recoverPending(
    limit: number,
  ): Promise<ModerationPostPayload[]> {
    const claimed = await this.redis.call(
      'XAUTOCLAIM',
      this.streamKey,
      this.consumerGroup,
      this.consumerName,
      String(this.claimIdleMs),
      this.claimCursor,
      'COUNT',
      String(limit),
    ) as RedisAutoClaimResponse;

    this.claimCursor = claimed[0] || '0-0';

    const entries = claimed[1] ?? [];

    const recoveredPosts: ModerationPostPayload[] = [];
    const eligibleEntries: RedisStreamEntry[] = [];

    for (const [streamId, fields] of entries) {
      const post = this.parseStreamEntry([
        streamId,
        fields,
      ]);

      const retryCount = await this.redis.hincrby(
        this.retryKey,
        streamId,
        1,
      );

      console.log(
        `Recovering post ${post.postId}, retry ${retryCount}`,
      );

      // Maximum retry limit exceeded
      if (retryCount > this.maxRetries) {
        await this.moveToDeadLetter(
          streamId,
          post,
          retryCount,
        );

        continue;
      }

      recoveredPosts.push(post);
      eligibleEntries.push([streamId, fields]);
    }

    await this.saveProcessingReference(
      eligibleEntries,
    );

    return recoveredPosts;
  }

  // ========================================
  // STEP 6: DEAD LETTER QUEUE
  // ========================================

  private async moveToDeadLetter(
    streamId: string,
    post: ModerationPostPayload,
    retryCount: number,
  ): Promise<void> {
    const pipeline = this.redis.multi();

    // Copy failed message into DLQ
    pipeline.xadd(
      this.deadLetterKey,
      '*',
      'data',
      JSON.stringify(post),
      'sourceStreamId',
      streamId,
      'retryCount',
      String(retryCount),
      'failureReason',
      'Maximum moderation retries exceeded',
    );

    // Acknowledge original message
    pipeline.xack(
      this.streamKey,
      this.consumerGroup,
      streamId,
    );

    // Remove original message
    pipeline.xdel(
      this.streamKey,
      streamId,
    );

    // Remove processing reference
    pipeline.hdel(
      this.processingKey,
      String(post.postId),
    );

    // Remove retry counter
    pipeline.hdel(
      this.retryKey,
      streamId,
    );

    const results = await pipeline.exec();

    if (
      !results ||
      results.some(([error]) => error !== null)
    ) {
      throw new Error(
        `Failed to move post ${post.postId} to DLQ`,
      );
    }

    console.log(
      `Post ${post.postId} moved to Dead Letter Queue`,
    );
  }

  // ========================================
  // STEP 3: DEQUEUE USING XREADGROUP
  // ========================================

  async dequeue(
    limit = 10,
  ): Promise<any> {
    const n = Math.max(
      1,
      Math.min(Math.floor(limit) || 10, 50),
    );

    await this.ensureConsumerGroup();

    // First recover eligible pending messages
    const recoveredPosts = await this.recoverPending(n);

    const remaining = n - recoveredPosts.length;

    let newEntries: RedisStreamEntry[] = [];

    // Read new messages if batch has remaining capacity
    if (remaining > 0) {
      const response = await this.redis.xreadgroup(
        'GROUP',
        this.consumerGroup,
        this.consumerName,
        'COUNT',
        remaining,
        'STREAMS',
        this.streamKey,
        '>',
      );

      newEntries = (
        response?.[0]?.[1] ?? []
      ) as RedisStreamEntry[];

      await this.saveProcessingReference(
        newEntries,
      );
    }

    const newPosts = newEntries.map(
      (entry) => this.parseStreamEntry(entry),
    );

    const posts = [
      ...recoveredPosts,
      ...newPosts,
    ];

    const batch: ModerationBatchPayload = {
      posts,
      totalPosts: posts.length,
    };

    console.log(
      `Dequeued ${posts.length} moderation posts`,
    );

    if (posts.length === 0) {
      return batch;
    }

    /*
      Send batch to AI service.
      If request fails, messages remain pending.
      XAUTOCLAIM can recover them after claimIdleMs.
    */

    try {
      const aiResponse = await this.sendBatch(posts);

      const results = this.extractModerationResults(
        aiResponse,
      );

      /*
        If AI returns results synchronously,
        save DB results and ACK messages.

        If AI works asynchronously and calls
        POST /moderation/result later, leave
        messages pending until that callback.
      */

      if (results && results.length > 0) {
        const saved = await this.saveModerationResults(
          results,
        );

        return {
          ...batch,
          aiResponse,
          moderation: saved,
        };
      }

      return {
        ...batch,
        aiResponse,
        message:
          'Batch sent to AI service. Waiting for moderation results.',
      };
    } catch (error) {
      console.error(
        'AI moderation request failed:',
        error,
      );

      // Do not ACK. Messages stay pending for recovery.
      throw new ServiceUnavailableException(
        'AI moderation service failed. Messages remain pending for retry.',
      );
    }
  }

  // ========================================
  // STEP 1: SEND BATCH TO AI MODERATION API
  // ========================================

  async sendBatch(
    posts: ModerationPostPayload[],
  ): Promise<unknown> {
    const payload = this.prepareBatch(posts);

    const apiUrl = process.env.MODERATION_API_URL;

    if (!apiUrl) {
      throw new Error(
        'MODERATION_API_URL is not configured',
      );
    }

    const response = await firstValueFrom(
      this.httpService.post(
        apiUrl,
        payload,
        {
          timeout:
            Number(process.env.MODERATION_API_TIMEOUT) ||
            30000,
        },
      ),
    );

    return response.data;
  }

  // ========================================
  // EXTRACT AI RESULTS
  // ========================================

  private extractModerationResults(
    response: any,
  ): ModerationResultPayload[] | null {
    // AI directly returns an array
    if (Array.isArray(response)) {
      return response as ModerationResultPayload[];
    }

    // AI returns { results: [...] }
    if (
      response &&
      Array.isArray(response.results)
    ) {
      return response.results as ModerationResultPayload[];
    }

    // AI is processing asynchronously
    return null;
  }

  // ========================================
  // STEP 4: ACK PROCESSED POSTS
  // ========================================

  private async acknowledgeProcessedPosts(
    postIds: number[],
  ): Promise<void> {
    const uniquePostIds = [...new Set(postIds)];

    const pipeline = this.redis.pipeline();

    for (const postId of uniquePostIds) {
      const streamId = await this.redis.hget(
        this.processingKey,
        String(postId),
      );

      if (!streamId) {
        throw new Error(
          `No processing reference found for post ${postId}. Cannot ACK.`,
        );
      }

      pipeline.xack(
        this.streamKey,
        this.consumerGroup,
        streamId,
      );

      pipeline.xdel(
        this.streamKey,
        streamId,
      );

      pipeline.hdel(
        this.processingKey,
        String(postId),
      );

      pipeline.hdel(
        this.retryKey,
        streamId,
      );
    }

    const results = await pipeline.exec();

    if (
      !results ||
      results.some(([error]) => error !== null)
    ) {
      throw new Error(
        'Failed to acknowledge moderation messages',
      );
    }

    console.log(
      `Acknowledged ${uniquePostIds.length} moderation messages`,
    );
  }

  // ========================================
  // STEP 2: SAVE MODERATION RESULTS
  // ========================================

  async saveModerationResults(
    results: ModerationResultPayload[],
  ) {
    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      throw new BadRequestException(
        'Moderation results must be a non-empty array',
      );
    }

    const validStatuses: ModerationStatus[] = [
      'APPROVED',
      'REJECTED',
      'REVIEW',
    ];

    const savedResults = [];

    const requeuedPosts: ModerationPostPayload[] = [];

    const processedPostIds: number[] = [];

    for (const result of results) {
      const {
        moderationId,
        postId,
        userId,
        postType,
        mediaUrl,
        moderation_status,
        categories,
        reasons,
      } = result;

      // Validate AI response
      if (
        !Number.isInteger(moderationId) ||
        moderationId <= 0 ||
        !Number.isInteger(postId) ||
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !postType ||
        !mediaUrl ||
        !validStatuses.includes(moderation_status)
      ) {
        throw new BadRequestException(
          `Invalid moderation result for postId: ${postId}`,
        );
      }

      // Verify post exists
      const post =
        await this.prisma.client.orm.public.Post
          .where({ id: postId })
          .first();

      if (!post) {
        throw new NotFoundException(
          `Post with ID ${postId} not found`,
        );
      }

      // Verify post owner
      if (post.userId !== userId) {
        throw new BadRequestException(
          `User ID does not match post ID ${postId}`,
        );
      }

      // Update Post moderation status
      await this.prisma.client.orm.public.Post
        .where({ id: postId })
        .update({
          moderation_status,
        });

      // Find existing ModerationResult
      // Find ModerationResult using moderationId
      const existingResult =
        await this.prisma.client.orm.public.ModerationResult
          .where({ id: moderationId })
          .first();

      if (!existingResult) {
        throw new NotFoundException(
          `ModerationResult with ID ${moderationId} not found`,
        );
      }

      // Verify moderation record belongs to the same post and user
      if (
        existingResult.postId !== postId ||
        existingResult.userId !== userId
      ) {
        throw new BadRequestException(
          `Moderation ID does not match post ID ${postId}`,
        );
      }

      // Update using moderationId
      const savedResult =
        await this.prisma.client.orm.public.ModerationResult
          .where({ id: moderationId })
          .update({
            userId,
            postType,
            mediaUrl,
            moderation_status,
            categories: categories ?? [],
            reasons: reasons ?? [],
            updatedAt: Temporal.Now.instant(),
          });

      savedResults.push(savedResult);

      processedPostIds.push(postId);

      // REVIEW posts are requeued
      if (moderation_status === 'REVIEW') {
        requeuedPosts.push({
          moderationId,
          postId,
          userId,
          postType,
          mediaURL: mediaUrl,
        });
      }
    }

    /*
      Requeue REVIEW posts before ACKing
      their previous stream messages.
    */

    if (requeuedPosts.length > 0) {
      await this.enqueue(requeuedPosts);
    }

    /*
      ACK only after all database operations
      and REVIEW requeue operations succeed.
    */

    await this.acknowledgeProcessedPosts(
      processedPostIds,
    );

    return {
      message: 'Moderation results processed successfully',
      totalReceived: results.length,
      totalSaved: savedResults.length,
      totalReviewQueued: requeuedPosts.length,
      results: savedResults,
    };
  }
}