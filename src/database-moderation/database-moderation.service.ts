import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Temporal } from '@js-temporal/polyfill';

import { PrismaService } from '../prisma/prisma.service';

// ========================================
// TYPES
// ========================================

type ModerationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVIEW';

type ModerationPost = {
  postId: number;
  userId: number;
  postType: any;
  moderationRetryCount: number;
  caption: string | null;
  mediaUrl: string;
  mediaUrls: string[];
  media: Array<{
    postId: number;
    mediaType: string;
    mediaUrl: string;
    position: number;
  }>;
};

type ModerationInput =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

// ========================================
// SERVICE
// ========================================

@Injectable()
export class DatabaseModerationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    DatabaseModerationService.name,
  );

  private readonly openai: OpenAI;

  private interval: ReturnType<typeof setInterval> | null =
    null;

  private isProcessing = false;

  private readonly batchSize = 10;

  private readonly batchDelayMs = 4000;

  private readonly maxModerationRetries = 3;

  private readonly retryDelayMs = 4000;

  private readonly retryBatchSize = 10;

  private readonly moderationModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is missing in .env',
      );
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: 60000,
      maxRetries: 2,
    });

    this.moderationModel =
      this.configService.get<string>(
        'OPENAI_MODERATION_MODEL',
      ) || 'omni-moderation-latest';
  }

  // ========================================
  // MODULE INITIALIZATION
  // ========================================

  onModuleInit() {
    this.logger.log(
      'Database Moderation Service initialized',
    );

    void this.processPendingPosts();

    this.interval = setInterval(() => {
      void this.processPendingPosts();
    }, this.batchDelayMs);

    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.logger.log(
      'Database Moderation Service stopped',
    );
  }

  // ========================================
  // STEP 1: FETCH PENDING AND REVIEW POSTS
  // ========================================

  async processPendingPosts() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      this.logger.log(
        'Checking PostgreSQL for pending and retryable REVIEW posts...',
      );

      // Fetch PENDING posts
      const pendingPosts =
        await this.prisma.client.orm.public.Post
          .where({
            moderation_status: 'PENDING',
            deletedAt: null,
          })
          .orderBy((post) => post.createdAt.asc())
          .limit(this.batchSize)
          .all();

      // Fetch REVIEW posts
      const reviewPosts =
        await this.prisma.client.orm.public.Post
          .where({
            moderation_status: 'REVIEW',
            deletedAt: null,
          })
          .orderBy((post) => post.createdAt.asc())
          .all();

      const now = Date.now();

      // Filter REVIEW posts eligible for retry
      const retryableReviewPosts = reviewPosts
        .filter((post) => {
          const retryCount = Number(
            (post as any).moderationRetryCount ?? 0,
          );

          const retryAt = (post as any).nextModerationRetryAt;

          return (
            retryCount < this.maxModerationRetries &&
            retryAt != null &&
            new Date(retryAt).getTime() <= now
          );
        })
        .slice(0, this.retryBatchSize);

      // Combine pending and retryable REVIEW posts
      const selectedPosts = [
        ...pendingPosts,
        ...retryableReviewPosts,
      ].slice(0, this.batchSize);

      if (selectedPosts.length === 0) {
        this.logger.log(
          'No pending posts or due REVIEW retries found',
        );
        return;
      }

      this.logger.log(
        `Found ${pendingPosts.length} pending posts and ${retryableReviewPosts.length} due REVIEW retries`,
      );

      // Fetch post IDs
      const postIds = selectedPosts.map(
        (post) => Number(post.id),
      );

      // Fetch media
      const media =
        await this.prisma.client.orm.public.PostMedia
          .where((item) => item.postId.in(postIds))
          .orderBy((item) => item.position.asc())
          .all();

      // Prepare posts
      const batch: ModerationPost[] = selectedPosts.map(
        (post) => {
          const postMedia = media.filter(
            (item) =>
              Number(item.postId) === Number(post.id),
          );

          const mediaUrls = postMedia.map(
            (item) => String(item.mediaUrl),
          );

          return {
            postId: Number(post.id),
            userId: Number(post.userId),
            postType: post.postType,

            moderationRetryCount: Number(
              (post as any).moderationRetryCount ?? 0,
            ),

            caption: post.caption as string | null,

            mediaUrl: mediaUrls[0] ?? '',

            mediaUrls,

            media: postMedia.map((item) => ({
              postId: Number(item.postId),
              mediaType: String(item.mediaType),
              mediaUrl: String(item.mediaUrl),
              position: Number(item.position),
            })),
          };
        },
      );

      this.logger.log(
        `Prepared batch of ${batch.length} posts`,
      );

      // Process each post independently
      const results = await Promise.all(
        batch.map((post) => this.moderatePost(post)),
      );

      this.logger.log(
        `Batch completed: ${results.length} posts processed`,
      );

      this.logger.debug(
        JSON.stringify(results, null, 2),
      );
    } catch (error) {
      this.logger.error(
        'Database moderation batch failed',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    } finally {
      this.isProcessing = false;
    }
  }

  // ========================================
  // STEP 2: CREATE OR GET MODERATION RESULT
  // ========================================

  private async getOrCreateModerationResult(
    post: ModerationPost,
  ): Promise<{ id: number }> {
    const existingResult =
      await this.prisma.client.orm.public.ModerationResult
        .where({
          postId: post.postId,
        })
        .first() as { id: unknown } | null;

    if (existingResult) {
      const updated =
        await this.prisma.client.orm.public.ModerationResult
          .where({
            id: Number(existingResult.id),
          })
          .update({
            userId: post.userId,
            postType: post.postType,
            mediaUrl: post.mediaUrl,
            moderation_status: 'PENDING',
            categories: [],
            reasons: [],
            updatedAt: Temporal.Now.instant(),
          });

      if (!updated) {
        throw new Error(
          `Could not update ModerationResult for post ${post.postId}`,
        );
      }

      this.logger.log(
        `Existing ModerationResult found: ${Number(existingResult.id)}`,
      );

      return {
        id: Number(existingResult.id),
      };
    }

    const created =
      await this.prisma.client.orm.public.ModerationResult
        .create({
          postId: post.postId,
          userId: post.userId,
          postType: post.postType,
          mediaUrl: post.mediaUrl,
          moderation_status: 'PENDING',
          categories: [],
          reasons: [],
        }) as { id: unknown } | null;

    if (!created) {
      throw new Error(
        `Could not create ModerationResult for post ${post.postId}`,
      );
    }

    this.logger.log(
      `New ModerationResult created: ${Number(created.id)}`,
    );

    return {
      id: Number(created.id),
    };
  }

  // ========================================
  // STEP 3: SEND POST TO OPENAI
  // ========================================

  private async moderatePost(
    post: ModerationPost,
  ) {
    let moderationId: number | null = null;

    try {
      const moderationRecord =
        await this.getOrCreateModerationResult(post);

      moderationId = moderationRecord.id;

      this.logger.log(
        `Moderating postId=${post.postId}, userId=${post.userId}, moderationId=${moderationId}`,
      );

      // Prepare OpenAI input
      const input: ModerationInput[] = [];

      // Add caption
      if (post.caption?.trim()) {
        input.push({
          type: 'text',
          text: post.caption,
        });
      }

      // Check unsupported media
      const unsupportedMedia = post.media.filter(
        (item) => item.mediaType !== 'IMAGE',
      );

      // Add image URLs
      for (const mediaUrl of post.mediaUrls) {
        input.push({
          type: 'image_url',
          image_url: {
            url: mediaUrl,
          },
        });
      }

      // Unsupported or empty content goes to REVIEW
      // No automatic retry for these cases
      if (
        input.length === 0 ||
        unsupportedMedia.length > 0
      ) {
        const reasons = [
          input.length === 0
            ? 'No supported text or image content'
            : 'Post contains media that is not directly supported by this moderation flow',
        ];

        await this.saveModerationResult({
          postId: post.postId,
          moderationId,
          status: 'REVIEW',
          categories: {},
          reasons,
        });

        return {
          postId: post.postId,
          userId: post.userId,
          postType: post.postType,
          moderationId,
          mediaUrl: post.mediaUrl,
          mediaUrls: post.mediaUrls,
          moderation_status: 'REVIEW',
          reasons,
        };
      }

      // ========================================
      // OPENAI MODERATION API
      // ========================================

      this.logger.log(
        `Sending postId=${post.postId} to OpenAI`,
      );

      const response =
        await this.openai.moderations.create({
          model: this.moderationModel,
          input,
        });

      const result = response.results[0];

      if (!result) {
        throw new Error(
          'OpenAI returned an empty moderation result',
        );
      }

      // ========================================
      // PROCESS OPENAI RESPONSE
      // ========================================

      const moderationStatus: ModerationStatus =
        result.flagged
          ? 'REJECTED'
          : 'APPROVED';

      const categories = {
        ...result.categories,
        scores: result.category_scores,
      };

      const reasons = Object.entries(
        result.categories,
      )
        .filter(([, flagged]) => flagged === true)
        .map(([category]) => category);

      // ========================================
      // SAVE RESPONSE IN POSTGRESQL
      // ========================================

      const savedResult =
        await this.saveModerationResult({
          postId: post.postId,
          moderationId,
          status: moderationStatus,
          categories,
          reasons,
        });

      // Reset retry fields after successful moderation
      await this.prisma.client.orm.public.Post
        .where({
          id: post.postId,
        })
        .update({
          moderationRetryCount: 0,
          nextModerationRetryAt: null,
        });

      this.logger.log(
        `Moderation saved: postId=${post.postId}, moderationId=${moderationId}, status=${moderationStatus}`,
      );

      return {
        postId: post.postId,
        userId: post.userId,
        postType: post.postType,
        moderationId,
        mediaUrl: post.mediaUrl,
        mediaUrls: post.mediaUrls,
        moderation_status: moderationStatus,
        categories,
        reasons,
        savedResultId: savedResult.id,
      };
    } catch (error) {
      this.logger.error(
        `Moderation failed for postId=${post.postId}`,
        error instanceof Error
          ? error.message
          : String(error),
      );

      // Fail closed: do not approve if API fails
      if (moderationId !== null) {
        try {
          await this.saveModerationResult({
            postId: post.postId,
            moderationId,
            status: 'REVIEW',
            categories: {},
            reasons: [
              'OpenAI moderation request failed. Retry scheduled when eligible.',
            ],
          });

          const currentRetryCount =
            post.moderationRetryCount;

          const canRetry =
            currentRetryCount < this.maxModerationRetries;

          const nextRetryCount = canRetry
            ? currentRetryCount + 1
            : currentRetryCount;

          const nextRetryAt = canRetry
            ? Temporal.Now.instant().add({
                milliseconds: this.retryDelayMs,
              })
            : null;

          await this.prisma.client.orm.public.Post
            .where({
              id: post.postId,
            })
            .update({
              moderation_status: 'REVIEW',
              moderationRetryCount: nextRetryCount,
              nextModerationRetryAt: nextRetryAt,
            });

          if (canRetry) {
            this.logger.warn(
              `Retry ${nextRetryCount}/${this.maxModerationRetries} scheduled for postId=${post.postId} at ${nextRetryAt?.toString()}`,
            );
          } else {
            this.logger.warn(
              `Maximum retries reached for postId=${post.postId}; keeping REVIEW`,
            );
          }
        } catch (saveError) {
          this.logger.error(
            `Could not save failure status for postId=${post.postId}`,
            saveError instanceof Error
              ? saveError.message
              : String(saveError),
          );
        }
      }

      return {
        postId: post.postId,
        userId: post.userId,
        postType: post.postType,
        moderationId,
        mediaUrl: post.mediaUrl,
        mediaUrls: post.mediaUrls,
        moderation_status: 'REVIEW',
        error:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  // ========================================
  // STEP 4: SAVE MODERATION RESULT
  // ========================================

  private async saveModerationResult(data: {
    postId: number;
    moderationId: number;
    status: ModerationStatus;
    categories: any;
    reasons: string[];
  }): Promise<{ id: number }> {
    // Verify moderation record
    const existingResult =
      await this.prisma.client.orm.public.ModerationResult
        .where({
          id: data.moderationId,
          postId: data.postId,
        })
        .first();

    if (!existingResult) {
      throw new Error(
        `ModerationResult ${data.moderationId} not found for post ${data.postId}`,
      );
    }

    // Update ModerationResult
    const savedResult =
      await this.prisma.client.orm.public.ModerationResult
        .where({
          id: data.moderationId,
        })
        .update({
          moderation_status: data.status,
          categories: data.categories,
          reasons: data.reasons,
          updatedAt: Temporal.Now.instant(),
        }) as { id: unknown } | null;

    if (!savedResult) {
      throw new Error(
        `Could not update ModerationResult ${data.moderationId}`,
      );
    }

    // Update original Post moderation status
    const updatedPost =
      await this.prisma.client.orm.public.Post
        .where({
          id: data.postId,
        })
        .update({
          moderation_status: data.status,
        });

    if (!updatedPost) {
      throw new Error(
        `Could not update Post ${data.postId}`,
      );
    }

    this.logger.log(
      `Database updated successfully: postId=${data.postId}, moderationId=${data.moderationId}, status=${data.status}`,
    );

    return {
      id: Number(savedResult.id),
    };
  }
}