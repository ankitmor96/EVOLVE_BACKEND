
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

    const filenameWithoutExtension = safeFilename.replace(
      /\.[^.]+$/,
      '',
    );

    return new Promise<string>((resolve, reject) => {
      const stream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: `evolv/posts/documents/post_${postId}`,
          resource_type: 'raw',
          public_id: `${Date.now()}_${filenameWithoutExtension}`,
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

    // Fetch 11 posts to determine whether another page exists
    const posts = await query
      .limit(pageSize + 1)
      .all();

    const hasMore = posts.length > pageSize;
    const items = posts.slice(0, pageSize);

    // Fetch media for the current page in one separate query
    const postIds = items.map((post) => post.id);

    const media = postIds.length > 0
      ? await this.prisma.client.orm.public.PostMedia
        .where((m) => m.postId.in(postIds))
        .orderBy((m) => m.position.asc())
        .all()
      : [];

    // Attach each post's media without using include()
    const itemsWithMedia = items.map((post) => ({
      ...post,
      media: media.filter((item) => item.postId === post.id),
    }));

    const lastPost = items[items.length - 1];

    return {
      success: true,
      data: itemsWithMedia,
      pagination: {
        limit: pageSize,
        hasMore,
        nextCursor: hasMore && lastPost ? lastPost.id : null,
      },
    };
  }

}
