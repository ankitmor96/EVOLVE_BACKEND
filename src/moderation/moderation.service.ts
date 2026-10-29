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

  async onModuleDestroy() {
    await this.redis.quit();
  }
  constructor(
    private readonly httpService: HttpService,
  ) { }

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

  private readonly lastBatchKey = 'moderation:posts:last-response';

  async saveLastBatch(
    batch: ModerationBatchPayload,
  ): Promise<void> {
    await this.redis.set(
      this.lastBatchKey,
      JSON.stringify(batch),
    );
  }

  async getLastBatch(): Promise<ModerationBatchPayload> {
    const data = await this.redis.get(this.lastBatchKey);

    if (!data) {
      throw new NotFoundException(
        'No moderation batch received yet',
      );
    }

    return JSON.parse(data) as ModerationBatchPayload;
  }

  async sendBatch(
    posts: ModerationPostPayload[],
  ): Promise<unknown> {
    const payload = this.prepareBatch(posts);

    const apiUrl =
      process.env.MODERATION_API_URL ??
      'http://127.0.0.1:3000/api/moderation/batch';

    const response = await firstValueFrom(
      this.httpService.post(
        apiUrl,
        payload,
        {
          timeout: 10000,
        },
      ),
    );

    return response.data;
  }
}