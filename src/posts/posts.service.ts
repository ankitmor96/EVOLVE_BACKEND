
import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Temporal } from '@js-temporal/polyfill';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { PostsGateway } from './posts.gateway';

type UploadedMediaFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Injectable()
export class PostsService {

  constructor(
    private readonly prisma: PrismaService,

    @Inject('CLOUDINARY')
    private readonly cloudinaryClient: typeof cloudinary,

    @InjectQueue('posts')
    private readonly postsQueue: Queue,

    private readonly postsGateway: PostsGateway,
  ) { }


  // =====================================
  // ADD BACKGROUND JOB TO QUEUE
  // =====================================

  async enqueuePostJob(
    postId: number,
    userId: number,
  ) {
    console.log('➡️ Adding post job to queue:', {
      postId,
      userId,
    });

    try {
      const job = await this.postsQueue.add(
        'post-created',
        {
          postId,
          userId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      console.log('✅ Post job added to queue:', job.id);

      return job;
    } catch (error) {
      console.error('❌ Failed to add post job to queue:', error);
      throw error;
    }
  }

  private async getUserSkillCategories(userId: number) {
    const userSkills = await this.prisma.client.orm.public.UserSkill
      .where({ userId })
      .all();

    const skillIds = [...new Set(userSkills.map((item) => item.skillId))];

    if (skillIds.length === 0) {
      return [];
    }

    const skills = await this.prisma.client.orm.public.Skill
      .where((skill) => skill.id.in(skillIds))
      .all();

    const categoryIds = [
      ...new Set(skills.map((skill) => skill.categoryId)),
    ];

    if (categoryIds.length === 0) {
      return [];
    }

    const categories = await this.prisma.client.orm.public.SkillCategory
      .where((category) => category.id.in(categoryIds))
      .all();

    return categories;
  }

  private async savePostSkills(postId: number, userId: number) {
    const userSkills = await this.prisma.client.orm.public.UserSkill
      .where({ userId })
      .all();

    for (const userSkill of userSkills) {
      await this.prisma.client.orm.public.PostSkill.create({
        postId,
        skillId: userSkill.skillId,
        relationshipType: userSkill.relationshipType,
      });
    }

    return this.getUserSkillCategories(userId);
  }

  // =====================================
  // VALIDATE IMAGE
  // =====================================

  private validateImage(
    file: UploadedMediaFile | undefined,
  ): asserts file is UploadedMediaFile {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Please select an image');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported image format. Allowed formats: JPG, JPEG, PNG and WEBP',
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Image size must not exceed 5 MB',
      );
    }
  }

  // =====================================
  // VALIDATE VIDEO
  // =====================================

  private validateVideo(
    file: UploadedMediaFile | undefined,
  ): asserts file is UploadedMediaFile {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Please select a video');
    }

    const allowedMimeTypes = [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/3gpp',
      'video/ogg',
      'video/x-flv',
      'video/mpeg',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported video format. Allowed formats: MP4, WEBM, MOV, AVI, MKV, 3GP, OGV, FLV and MPEG',
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException(
        'Video size must not exceed 50 MB',
      );
    }
  }

  // =====================================
  // UPLOAD IMAGE TO CLOUDINARY
  // =====================================

  private async uploadImageToCloudinary(
    buffer: Buffer,
    postId: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const stream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: `evolv/posts/images/post_${postId}`,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result?.secure_url) {
            reject(new Error('Cloudinary returned no image URL'));
            return;
          }

          resolve(result.secure_url);
        },
      );

      stream.end(buffer);
    });
  }

  // =====================================
  // UPLOAD VIDEO TO CLOUDINARY
  // =====================================

  private async uploadVideoToCloudinary(
    buffer: Buffer,
    postId: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const stream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: `evolv/posts/videos/post_${postId}`,
          resource_type: 'video',
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result?.secure_url) {
            reject(new Error('Cloudinary returned no video URL'));
            return;
          }

          resolve(result.secure_url);
        },
      );

      stream.end(buffer);
    });
  }

  // =====================================
  // SAVE MEDIA DETAILS
  // =====================================

  private async savePostMedia(
    postId: number,
    mediaUrl: string,
    mediaType: 'IMAGE' | 'VIDEO',
  ) {
    return this.prisma.client.orm.public.PostMedia.create({
      postId,
      mediaType,
      mediaUrl,
      position: 0,
    });
  }

  // =====================================
  // CREATE POST WITH IMAGE
  // =====================================

  async createPostWithImage(
    userId: number,
    caption: string,
    file: UploadedMediaFile | undefined,
  ) {
    this.validateImage(file);

    const post = await this.prisma.client.orm.public.Post.create({
      userId,
      postType: 'IMAGE',
      postKind: 'GENERAL',
      caption: caption?.trim() || null,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skillCategories = await this.savePostSkills(postId, userId);

    try {
      const mediaUrl = await this.uploadImageToCloudinary(
        file.buffer,
        postId,
      );

      const media = await this.savePostMedia(
        postId,
        mediaUrl,
        'IMAGE',
      );

      // Queue a background job after the post and media are saved.

      await this.enqueuePostJob(postId, userId);

      // Notify connected clients about the new post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });

      return {
        success: true,
        message: 'Post created successfully with image',
        post,
        media,
        skillCategories,
      };

    } catch (error) {
      console.error('Create post with image failed:', error);

      throw new InternalServerErrorException(
        'Post was created, but image upload, media saving or job queuing failed',
      );
    }
  }

  // =====================================
  // CREATE POST WITH VIDEO
  // =====================================

  async createPostWithVideo(
    userId: number,
    caption: string,
    file: UploadedMediaFile | undefined,
  ) {
    this.validateVideo(file);

    const post = await this.prisma.client.orm.public.Post.create({
      userId,
      postType: 'VIDEO',
      postKind: 'GENERAL',
      caption: caption?.trim() || null,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skillCategories = await this.savePostSkills(postId, userId);

    try {
      const mediaUrl = await this.uploadVideoToCloudinary(
        file.buffer,
        postId,
      );

      const media = await this.savePostMedia(
        postId,
        mediaUrl,
        'VIDEO',
      );


      await this.enqueuePostJob(postId, userId);

      // Notify connected clients about the new video post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });


      return {
        success: true,
        message: 'Post created successfully with video',
        post,
        media,
        skillCategories,
      };

    } catch (error) {
      console.error('Create post with video failed:', error);

      throw new InternalServerErrorException(
        'Post was created, but video upload, media saving or job queuing failed',
      );
    }
  }

  // =====================================
  // UPLOAD IMAGE TO AN EXISTING POST
  // =====================================

  async uploadPostImage(
    postId: number,
    userId: number,
    file: UploadedMediaFile | undefined,
  ) {
    this.validateImage(file);

    const post = await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        userId,
        deletedAt: null,
      })
      .first();

    if (!post) {
      throw new NotFoundException(
        'Post not found or you do not have permission to upload images to it',
      );
    }

    let mediaUrl: string;

    try {
      mediaUrl = await this.uploadImageToCloudinary(
        file.buffer,
        postId,
      );
    } catch (error) {
      console.error('Post image Cloudinary upload failed:', error);

      throw new InternalServerErrorException(
        'Failed to upload image to Cloudinary',
      );
    }

    try {
      const media = await this.savePostMedia(
        postId,
        mediaUrl,
        'IMAGE',
      );

      await this.enqueuePostJob(postId, userId);

      return {
        success: true,
        message: 'Post image uploaded successfully',
        media,
      };
    } catch (error) {
      console.error(
        'Failed to save post image details or queue job:',
        error,
      );

      throw new InternalServerErrorException(
        'Image uploaded, but saving media details or queuing the job failed',
      );
    }
  }

  // =====================================
  // VALIDATE DOCUMENT
  // =====================================

  private validateDocument(
    file:
      | {
        buffer: Buffer;
        mimetype: string;
        size: number;
        originalname?: string;
      }
      | undefined,
  ): asserts file is {
    buffer: Buffer;
    mimetype: string;
    size: number;
    originalname?: string;
  } {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Please select a document');
    }

    const allowedExtensions = [
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.csv',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
    ];

    const filename = file.originalname ?? '';
    const extension = filename
      .slice(filename.lastIndexOf('.'))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        'Allowed document formats: PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, PPT and PPTX',
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException(
        'Document size must not exceed 10 MB',
      );
    }
  }

  // =====================================
  // UPLOAD DOCUMENT TO CLOUDINARY
  // =====================================

  private async uploadDocumentToCloudinary(
    buffer: Buffer,
    postId: number,
    originalname: string,
  ): Promise<string> {
    const safeFilename = originalname
      .replace(/[\/\\]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const extensionMatch = safeFilename.match(/\.[^.]+$/);
    const extension = extensionMatch?.[0] ?? '';
    const filenameWithoutExtension = extension
      ? safeFilename.slice(0, -extension.length)
      : safeFilename;

    const publicId = `${Date.now()}_${filenameWithoutExtension}${extension}`;

    return new Promise<string>((resolve, reject) => {
      const stream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: `evolv/posts/documents/post_${postId}`,
          resource_type: 'raw',
          public_id: publicId,
          filename: safeFilename,
          use_filename: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result?.secure_url) {
            reject(new Error('Cloudinary returned no document URL'));
            return;
          }

          console.log('Uploaded document:', {
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes,
            url: result.secure_url,
          });

          resolve(result.secure_url);
        },
      );

      stream.end(buffer);
    });
  }

  // =====================================
  // CREATE POST WITH DOCUMENT
  // =====================================

  async createPostWithDocument(
    userId: number,
    caption: string,
    file:
      | {
        buffer: Buffer;
        mimetype: string;
        size: number;
        originalname?: string;
      }
      | undefined,
  ) {
    this.validateDocument(file);

    const originalname = file.originalname ?? 'document.pdf';

    const post = await this.prisma.client.orm.public.Post.create({
      userId,
      postType: 'TEXT',
      postKind: 'GENERAL',
      caption: caption?.trim() || originalname,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skillCategories = await this.savePostSkills(postId, userId);

    try {
      const mediaUrl = await this.uploadDocumentToCloudinary(
        file.buffer,
        postId,
        originalname,
      );

      const media = await this.prisma.client.orm.public.PostMedia.create({
        postId,
        mediaType: 'DOCUMENT',
        mediaUrl,
        position: 0,
        altText: originalname,
        metadata: {
          originalName: originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
      });


      await this.enqueuePostJob(postId, userId);

      // Notify connected clients about the new document post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });

      return {
        success: true,
        message: 'Document post created successfully',
        post,
        media,
        skillCategories,
      };

    } catch (error) {
      console.error('Create post with document failed:', error);

      throw new InternalServerErrorException(
        'Post was created, but document upload, media saving or job queuing failed',
      );
    }
  }




  async getFeed(cursor?: number) {
    const pageSize = 10;

    let query = this.prisma.client.orm.public.Post
      .where((p) => p.status.eq('PUBLISHED'))
      .where((p) => p.visibility.eq('PUBLIC'))
      .where((p) => p.deletedAt.isNull())
      .where((p) => p.publishedAt.isNotNull())
      .orderBy([
        (p) => p.createdAt.desc(),
        (p) => p.id.desc(),
      ]);

    // Validate cursor and prepare pagination
    if (cursor !== undefined) {
      if (!Number.isInteger(cursor) || cursor <= 0) {
        throw new BadRequestException('Invalid feed cursor');
      }

      const cursorPost = await this.prisma.client.orm.public.Post
        .where((p) => p.id.eq(cursor))
        .first();

      if (!cursorPost) {
        throw new NotFoundException('Feed cursor post not found');
      }

      query = query.cursor({
        createdAt: cursorPost.createdAt,
        id: cursorPost.id,
      });
    }

    // Fetch posts
    const posts = await query
      .limit(pageSize + 1)
      .all();

    const hasMore = posts.length > pageSize;
    const items = posts.slice(0, pageSize);

    const postIds = items.map((post) => post.id);

    // Fetch media
    const media = postIds.length > 0
      ? await this.prisma.client.orm.public.PostMedia
        .where((item) => item.postId.in(postIds))
        .orderBy((item) => item.position.asc())
        .all()
      : [];

    // Attach media and counts
    const itemsWithMedia = await Promise.all(
      items.map(async (post) => {
        const reactions =
          await this.prisma.client.orm.public.PostReaction
            .where({ postId: post.id })
            .all();

        const learningRecords =
          await this.prisma.client.orm.public.PostLearning
            .where({ postId: post.id })
            .all();

        return {
          ...post,

          media: media.filter(
            (item) => item.postId === post.id,
          ),

          reactionCounts: {
            APPRECIATE: reactions.filter(
              (reaction) =>
                reaction.reactionType === 'APPRECIATE',
            ).length,

            HELPFUL: reactions.filter(
              (reaction) =>
                reaction.reactionType === 'HELPFUL',
            ).length,
          },

          learningCount: learningRecords.length,
        };
      }),
    );

    const lastPost = items[items.length - 1];

    return {
      success: true,
      data: itemsWithMedia,
      pagination: {
        limit: pageSize,
        hasMore,
        nextCursor:
          hasMore && lastPost ? lastPost.id : null,
      },
    };
  }


  async getMyPostsByMediaType(
    userId: number,
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT',
  ) {
    const posts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(userId))
      .where((post) => post.deletedAt.isNull())
      .orderBy([
        (post) => post.createdAt.desc(),
        (post) => post.id.desc(),
      ])
      .all();

    const postIds = posts.map((post) => post.id);

    const media = postIds.length > 0
      ? await this.prisma.client.orm.public.PostMedia
        .where((item) => item.postId.in(postIds))
        .where((item) => item.mediaType.eq(mediaType))
        .orderBy((item) => item.position.asc())
        .all()
      : [];

    const matchingPostIds = new Set(
      media.map((item) => item.postId),
    );

    return {
      success: true,
      data: posts
        .filter((post) => matchingPostIds.has(post.id))
        .map((post) => ({
          ...post,
          media: media.filter((item) => item.postId === post.id),
        })),
    };
  }

  async getMyPostsCounts(userId: number) {
    const posts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(userId))
      .where((post) => post.deletedAt.isNull())
      .all();

    const postIds = posts.map((post) => post.id);

    const media = postIds.length > 0
      ? await this.prisma.client.orm.public.PostMedia
        .where((item) => item.postId.in(postIds))
        .all()
      : [];

    const imagePostIds = new Set(
      media
        .filter((item) => item.mediaType === 'IMAGE')
        .map((item) => item.postId),
    );

    const videoPostIds = new Set(
      media
        .filter((item) => item.mediaType === 'VIDEO')
        .map((item) => item.postId),
    );

    const documentPostIds = new Set(
      media
        .filter((item) => item.mediaType === 'DOCUMENT')
        .map((item) => item.postId),
    );

    return {
      success: true,
      data: {
        totalPosts: posts.length,
        imageCount: imagePostIds.size,
        videoCount: videoPostIds.size,
        documentCount: documentPostIds.size,
      },
    };
  }

  async setPostReaction(
    postId: number,
    userId: number,
    reactionType: 'APPRECIATE' | 'HELPFUL',
  ) {
    const post = await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        deletedAt: null,
      })
      .first();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingReaction =
      await this.prisma.client.orm.public.PostReaction
        .where({
          postId,
          userId,
        })
        .first();

    let reaction;

    if (existingReaction) {
      reaction = await this.prisma.client.orm.public.PostReaction
        .where({
          postId,
          userId,
        })
        .update({
          reactionType,
        });
    } else {
      reaction = await this.prisma.client.orm.public.PostReaction.create({
        postId,
        userId,
        reactionType,
      });
    }

    const reactions = await this.prisma.client.orm.public.PostReaction
      .where({
        postId,
      })
      .all();

    const reactionCounts = {
      APPRECIATE: reactions.filter(
        (item) => item.reactionType === 'APPRECIATE',
      ).length,
      HELPFUL: reactions.filter(
        (item) => item.reactionType === 'HELPFUL',
      ).length,
    };

    this.postsGateway.emitPostUpdate({
      type: 'REACTION_UPDATED',
      postId,
      userId,
      reactionType,
      reactionCounts,
    });

    return reaction;
  }
  async removePostReaction(
    postId: number,
    userId: number,
    reactionType: 'APPRECIATE' | 'HELPFUL',
  ) {
    const existingReaction =
      await this.prisma.client.orm.public.PostReaction
        .where({
          postId,
          userId,
          reactionType,
        })
        .first();

    if (!existingReaction) {
      throw new NotFoundException('Reaction not found');
    }

    await this.prisma.client.orm.public.PostReaction
      .where({
        postId,
        userId,
        reactionType,
      })
      .delete();

    const reactions = await this.prisma.client.orm.public.PostReaction
      .where({
        postId,
      })
      .all();

    const reactionCounts = {
      APPRECIATE: reactions.filter(
        (item) => item.reactionType === 'APPRECIATE',
      ).length,
      HELPFUL: reactions.filter(
        (item) => item.reactionType === 'HELPFUL',
      ).length,
    };

    this.postsGateway.emitPostUpdate({
      type: 'REACTION_DELETED',
      postId,
      userId,
      reactionType,
      reactionCounts,
    });

    return {
      success: true,
      message: 'Reaction removed successfully',
    };
  }

  async getPostReactions(
    postId: number,
    userId: number,
  ) {
    const post = await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        deletedAt: null,
      })
      .first();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const reactions =
      await this.prisma.client.orm.public.PostReaction
        .where({
          postId,
        })
        .all();

    const myReaction =
      reactions.find((reaction) => reaction.userId === userId);

    return {
      success: true,
      postId,
      counts: {
        APPRECIATE: reactions.filter(
          (reaction) => reaction.reactionType === 'APPRECIATE',
        ).length,
        HELPFUL: reactions.filter(
          (reaction) => reaction.reactionType === 'HELPFUL',
        ).length,
      },
      myReaction: myReaction?.reactionType ?? null,
    };
  }

  async markPostLearned(
    postId: number,
    userId: number,
  ) {
    const post = await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        deletedAt: null,
      })
      .first();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLearning =
      await this.prisma.client.orm.public.PostLearning
        .where({
          postId,
          userId,
        })
        .first();

    if (existingLearning) {
      return {
        success: true,
        message: 'Post is already marked as learned',
        data: existingLearning,
      };
    }

    const learning =
      await this.prisma.client.orm.public.PostLearning.create({
        postId,
        userId,
      });

    const learningRecords =
      await this.prisma.client.orm.public.PostLearning
        .where({
          postId,
        })
        .all();

    this.postsGateway.emitPostUpdate({
      type: 'LEARNING_UPDATED',
      postId,
      userId,
      isLearned: true,
      learningCount: learningRecords.length,
    });

    return {
      success: true,
      message: 'Post marked as learned successfully',
      data: learning,
    };
  }
  async unmarkPostLearned(
    postId: number,
    userId: number,
  ) {
    const existingLearning =
      await this.prisma.client.orm.public.PostLearning
        .where({
          postId,
          userId,
        })
        .first();

    if (!existingLearning) {
      throw new NotFoundException(
        'Post is not marked as learned',
      );
    }

    await this.prisma.client.orm.public.PostLearning
      .where({
        postId,
        userId,
      })
      .delete();

    const learningRecords =
      await this.prisma.client.orm.public.PostLearning
        .where({
          postId,
        })
        .all();

    this.postsGateway.emitPostUpdate({
      type: 'LEARNING_UPDATED',
      postId,
      userId,
      isLearned: false,
      learningCount: learningRecords.length,
    });

    return {
      success: true,
      message: 'Post learning removed successfully',
    };
  }

}
