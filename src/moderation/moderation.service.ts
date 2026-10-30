import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';

import Redis from 'ioredis';

import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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

@Injectable()
export class ModerationService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  });

  /** posts waiting for the AI model (Colab) to pick them up */
  private readonly pendingKey = 'moderation:posts:pending';

  /** copy of the most recent batch, only for debugging */
  private readonly lastBatchKey = 'moderation:posts:last-response';

  constructor(private readonly httpService: HttpService) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  prepareBatch(posts: ModerationPostPayload[]): ModerationBatchPayload {
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new BadRequestException('Batch must contain at least one post');
    }

    return {
      posts,
      totalPosts: posts.length,
    };
  }

  async saveLastBatch(batch: ModerationBatchPayload): Promise<void> {
    await this.redis.set(this.lastBatchKey, JSON.stringify(batch));
  }

  async getLastBatch(): Promise<ModerationBatchPayload> {
    const data = await this.redis.get(this.lastBatchKey);

    if (!data) {
      throw new NotFoundException('No moderation batch received yet');
    }

    return JSON.parse(data) as ModerationBatchPayload;
  }

  /** Append posts to the queue the model reads from (nothing is overwritten). */
  async enqueue(
    posts: ModerationPostPayload[],
  ): Promise<ModerationBatchPayload> {
    const batch = this.prepareBatch(posts);

    await this.redis.rpush(
      this.pendingKey,
      ...batch.posts.map((p) => JSON.stringify(p)),
    );

    await this.saveLastBatch(batch);

    return batch;
  }

  /** Take up to `limit` posts off the front of the queue, atomically. Empty queue -> 0 posts. */
  async dequeue(limit = 10): Promise<ModerationBatchPayload> {
    const n = Math.max(1, Math.min(Math.floor(limit) || 10, 50));

    const res = await this.redis
      .multi()
      .lrange(this.pendingKey, 0, n - 1)
      .ltrim(this.pendingKey, n, -1)
      .exec();

    const items = (res?.[0]?.[1] as string[] | undefined) ?? [];
    const posts = items.map((i) => JSON.parse(i) as ModerationPostPayload);

    return { posts, totalPosts: posts.length };
  }

  /** Called by PostsProcessor: POSTs a batch (with a body) to our own /moderation/batch endpoint. */
  async sendBatch(posts: ModerationPostPayload[]): Promise<unknown> {
    const payload = this.prepareBatch(posts);

    const apiUrl =
      process.env.MODERATION_API_URL ??
      'http://127.0.0.1:3000/api/moderation/batch';

    const response = await firstValueFrom(
      this.httpService.post(apiUrl, payload, { timeout: 10000 }),
    );

    return response.data;
  }
}