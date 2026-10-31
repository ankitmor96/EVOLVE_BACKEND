import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';

import Redis from 'ioredis';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';

export interface ModerationPostPayload {
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

@Injectable()
export class ModerationService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  });

  private readonly pendingKey =
    'moderation:posts:pending';

  private readonly lastBatchKey =
    'moderation:posts:last-response';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

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

  async saveLastBatch(
    batch: ModerationBatchPayload,
  ): Promise<void> {
    await this.redis.set(
      this.lastBatchKey,
      JSON.stringify(batch),
    );
  }

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

  async enqueue(
    posts: ModerationPostPayload[],
  ): Promise<ModerationBatchPayload> {
    const batch = this.prepareBatch(posts);

    await this.redis.rpush(
      this.pendingKey,
      ...batch.posts.map((post) =>
        JSON.stringify(post),
      ),
    );

    await this.saveLastBatch(batch);

    return batch;
  }

  async dequeue(
    limit = 10,
  ): Promise<ModerationBatchPayload> {
    const n = Math.max(
      1,
      Math.min(Math.floor(limit) || 10, 50),
    );

    const res = await this.redis
      .multi()
      .lrange(this.pendingKey, 0, n - 1)
      .ltrim(this.pendingKey, n, -1)
      .exec();

    const items =
      (res?.[0]?.[1] as string[] | undefined) ?? [];

    const posts = items.map(
      (item) =>
        JSON.parse(item) as ModerationPostPayload,
    );

    return {
      posts,
      totalPosts: posts.length,
    };
  }

  async sendBatch(
    posts: ModerationPostPayload[],
  ): Promise<unknown> {
    const payload = this.prepareBatch(posts);

    const apiUrl =
      process.env.MODERATION_API_URL ??
      'http://127.0.0.1:3000/api/moderation/batch';

    const response = await firstValueFrom(
      this.httpService.post(apiUrl, payload, {
        timeout: 10000,
      }),
    );

    return response.data;
  }

  async saveModerationResults(results: any[]) {
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

    for (const result of results) {
      const {
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

      // Verify the response belongs to the post owner
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
      const existingResult =
        await this.prisma.client.orm.public.ModerationResult
          .where({ postId })
          .first();

      let savedResult;

      if (existingResult) {
        // Update the same record; do not create a duplicate
        savedResult =
          await this.prisma.client.orm.public.ModerationResult
            .where({ postId })
            .update({
              userId,
              postType,
              mediaUrl,
              moderation_status,
              categories: categories ?? [],
              reasons: reasons ?? [],
              updatedAt: new Date(),
            });
      } else {
        // Create the first moderation result
        savedResult =
          await this.prisma.client.orm.public.ModerationResult
            .create({
              postId,
              userId,
              postType,
              mediaUrl,
              moderation_status,
              categories: categories ?? [],
              reasons: reasons ?? [],
            });
      }

      savedResults.push(savedResult);

      // REVIEW posts are sent back for moderation
      if (moderation_status === 'REVIEW') {
        requeuedPosts.push({
          postId,
          userId,
          postType,
          mediaURL: mediaUrl,
        });
      }
    }

    // Requeue REVIEW posts through the existing moderation batch flow
    if (requeuedPosts.length > 0) {
      await this.enqueue(requeuedPosts);
    }

    return {
      message: 'Moderation results processed successfully',
      totalReceived: results.length,
      totalSaved: savedResults.length,
      totalReviewQueued: requeuedPosts.length,
      results: savedResults,
    };
  }
}