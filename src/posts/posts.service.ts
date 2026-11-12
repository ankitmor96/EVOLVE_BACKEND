
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
import { NotificationsService } from '../notifications/notifications.service';

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

    private readonly notificationsService: NotificationsService,
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
  // ADD MODERATION JOB TO QUEUE
  // =====================================

  async enqueueModerationJob(
    postId: number,
    userId: number,
  ) {
    console.log('Adding moderation job to queue:', {
      postId,
      userId,
    });

    return this.postsQueue.add(
      'moderation-post-created',
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

  private async savePostSkills(
    postId: number,
    skillIds: number[],
  ) {
    const uniqueSkillIds = [...new Set(skillIds)];

    if (uniqueSkillIds.length === 0) {
      return [];
    }

    // Fetch selected skills
    const skills = await this.prisma.client.orm.public.Skill
      .where((skill) => skill.id.in(uniqueSkillIds))
      .all();

    // Validate selected skill IDs
    if (skills.length !== uniqueSkillIds.length) {
      throw new BadRequestException(
        'One or more selected skills are invalid',
      );
    }

    // Save selected skills with post ID
    for (const skillId of uniqueSkillIds) {
      await this.prisma.client.orm.public.PostSkill.create({
        postId,
        skillId,
      });
    }

    // Return actual selected skills, not categories
    return skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
    }));
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
    skillIds: number[] = [],
  ) {
    this.validateImage(file);

    const post = await this.prisma.client.orm.public.Post.create({
      userId,
      postType: 'IMAGE',
      postKind: 'GENERAL',
      caption: caption?.trim() || null,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      moderation_status: 'PENDING',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skills = await this.savePostSkills(postId, skillIds);

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
      await this.enqueueModerationJob(postId, userId);

      // Notify connected clients about the new post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });

      await this.notificationsService.notifyAcceptedConnectionsAboutPost(
        userId,
        postId,
      );

      return {
        success: true,
        message: 'Post created successfully with image',
        post,
        media,
        skills,
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
    skillIds: number[] = [],
  ) {
    this.validateVideo(file);

    const post = await this.prisma.client.orm.public.Post.create({
      userId,
      postType: 'VIDEO',
      postKind: 'GENERAL',
      caption: caption?.trim() || null,
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      moderation_status: 'PENDING',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skills = await this.savePostSkills(postId, skillIds);

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
      await this.enqueueModerationJob(postId, userId);

      // Notify connected clients about the new video post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });

      await this.notificationsService.notifyAcceptedConnectionsAboutPost(
        userId,
        postId,
      );


      return {
        success: true,
        message: 'Post created successfully with video',
        post,
        media,
        skills,
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
    file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname?: string;
    } | undefined,
    skillIds: number[] = [],
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
      moderation_status: 'PENDING',
      publishedAt: Temporal.Now.instant(),
    });

    const postId = Number(post.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      throw new InternalServerErrorException(
        'Invalid post ID returned from database',
      );
    }

    const skills = await this.savePostSkills(postId, skillIds);

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
      await this.enqueueModerationJob(postId, userId);

      // Notify connected clients about the new document post.
      this.postsGateway.emitPostCreated({
        post,
        media,
      });

      await this.notificationsService.notifyAcceptedConnectionsAboutPost(
        userId,
        postId,
      );

      return {
        success: true,
        message: 'Document post created successfully',
        post,
        media,
        skills,
      };

    } catch (error) {
      console.error('Create post with document failed:', error);

      throw new InternalServerErrorException(
        'Post was created, but document upload, media saving or job queuing failed',
      );
    }
  }


  private async getPersonalizedFeedSkillIds(
    userId: number,
  ): Promise<{
    skillIds: number[];
    feedMode: 'INITIAL' | 'EXPANDED';
    highlightedSkill: string | null;
    skillDistribution: {
      skillId: number;
      skillName: string;
      categoryId: number;
      points: number;
      percentage: number;
      postQuota: number;
      categorySkillIds: number[];
    }[];
  }> {
    // 1. Count unique explorations
    const explorations =
      await this.prisma.client.orm.public.UserPostExploration
        .where({ userId })
        .all();

    const uniqueExploredPosts = new Set(
      explorations.map((item: any) => Number(item.postId)),
    );

    // 2. Get onboarding skills
    const userSkills =
      await this.prisma.client.orm.public.UserSkill
        .where({
          userId,
          relationshipType: {
            in: ['CAN_DO', 'LEARNING', 'WANT_TO_IMPROVE'],
          },
        })
        .all();

    // 3. Get active skills
    const activeSkills =
      await this.prisma.client.orm.public.Skill
        .where({ isActive: true })
        .all();

    const activeSkillIds = new Set(
      activeSkills.map((skill: any) => Number(skill.id)),
    );
    console.log("Active Skills:", activeSkillIds);

    // 4. Keep active onboarding skills
    const onboardingSkillIds = [
      ...new Set(
        userSkills
          .map((item: any) => Number(item.skillId))
          // .filter((id: number) => activeSkillIds.has(id)),
      ),
    ];

    console.log('[FEED CONFIG] User ID:', userId);
    console.log('[FEED CONFIG] Explored Posts:', uniqueExploredPosts.size);
    console.log('[FEED CONFIG] Onboarding Skills:', onboardingSkillIds);

    // 5. Before 10 unique explorations: INITIAL feed
    if (uniqueExploredPosts.size < 10) {
      return {
        skillIds: onboardingSkillIds,
        feedMode: 'INITIAL',
        highlightedSkill: null,
        skillDistribution: [],
      };
    }

    // 6. Get skill points
    const skillPoints =
      await this.prisma.client.orm.public.UserSkillPoint
        .where({ userId })
        .all();

    const pointMap = new Map<number, number>();

    for (const item of skillPoints) {
      const skillId = Number(item.skillId);

      if (onboardingSkillIds.includes(skillId)) {
        pointMap.set(skillId, Number(item.points));
      }
    }

    const skillPointData = onboardingSkillIds.map((skillId) => {
      const skill = activeSkills.find(
        (item: any) => Number(item.id) === skillId,
      );

      return {
        skillId,
        skillName: String(skill?.name ?? ''),
        categoryId: Number(skill?.categoryId),
        points: pointMap.get(skillId) ?? 0,
      };
    });

    const totalPoints = skillPointData.reduce(
      (total, item) => total + item.points,
      0,
    );

    // 7. If no points, use INITIAL feed
    if (totalPoints <= 0) {
      return {
        skillIds: onboardingSkillIds,
        feedMode: 'INITIAL',
        highlightedSkill: null,
        skillDistribution: [],
      };
    }

    // 8. Calculate percentage
    const distribution = skillPointData
      .map((item) => ({
        ...item,
        percentage: (item.points / totalPoints) * 100,
      }))
      .sort((a, b) => {
        const difference = b.points - a.points;

        return difference !== 0
          ? difference
          : a.skillId - b.skillId;
      });

    // 9. Calculate quota out of 10 using largest remainder
    const quotaData = distribution.map((item) => {
      const exactQuota = (item.percentage / 100) * 10;

      return {
        ...item,
        postQuota: Math.floor(exactQuota),
        remainder: exactQuota - Math.floor(exactQuota),
      };
    });

    let remainingPosts =
      10 -
      quotaData.reduce(
        (total, item) => total + item.postQuota,
        0,
      );

    const remainderOrder = [...quotaData].sort((a, b) => {
      const difference = b.remainder - a.remainder;

      return difference !== 0
        ? difference
        : b.points - a.points;
    });

    for (let i = 0; i < remainingPosts; i++) {
      const selected = remainderOrder[i];

      if (selected) {
        selected.postQuota += 1;
      }
    }

    // 10. Prepare category skill IDs
    const skillDistribution = quotaData.map((item) => {
      const categorySkillIds = activeSkills
        .filter(
          (skill: any) =>
            Number(skill.categoryId) === item.categoryId,
        )
        .map((skill: any) => Number(skill.id));

      return {
        skillId: item.skillId,
        skillName: item.skillName,
        categoryId: item.categoryId,
        points: item.points,
        percentage: Number(item.percentage.toFixed(2)),
        postQuota: item.postQuota,
        categorySkillIds: [
          ...new Set([
            item.skillId,
            ...categorySkillIds,
          ]),
        ],
      };
    });

    // 11. All skill and category IDs
    const allSkillIds = [
      ...new Set(
        skillDistribution.flatMap(
          (item) => item.categorySkillIds,
        ),
      ),
    ];

    return {
      skillIds: allSkillIds,
      feedMode: 'EXPANDED',
      highlightedSkill:
        skillDistribution[0]?.skillName ?? null,
      skillDistribution,
    };
  }

  async getFeed(userId: number, cursor?: number | string) {
    // Normalize and validate user ID
    userId = Number(userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    const normalizedCursor =
      cursor === undefined ? undefined : Number(cursor);

    if (
      normalizedCursor !== undefined &&
      (!Number.isInteger(normalizedCursor) || normalizedCursor <= 0)
    ) {
      throw new BadRequestException('Invalid feed cursor');
    }

    const pageSize = 10;

    console.log('========== FEED REQUEST START ==========');
    console.log('[FEED] Logged-in User ID:', userId);

    // =====================================
    // 1. PERSONALIZED FEED CONFIGURATION
    // =====================================

    const personalizedFeed =
      await this.getPersonalizedFeedSkillIds(userId);

    console.log('[FEED] Mode:', personalizedFeed.feedMode);
    console.log('[FEED] Matching Skill IDs:', personalizedFeed.skillIds);

    const personalizedPostIds: number[] = [];

    if (personalizedFeed.skillIds.length > 0) {
      const matchingPostSkills =
        await this.prisma.client.orm.public.PostSkill
          .where((item: any) =>
            item.skillId.in(personalizedFeed.skillIds),
          )
          .all();

      personalizedPostIds.push(
        ...new Set(
          matchingPostSkills.map(
            (item: any) => Number(item.postId),
          ),
        ),
      );
    }

    console.log('[FEED] Matching Post IDs:', personalizedPostIds);

    // =====================================
    // 2. CONNECTIONS
    // =====================================

    const connections =
      await this.prisma.client.orm.public.Connection
        .where((connection) =>
          connection.status.eq('ACCEPTED'),
        )
        .all();

    const connectedUserIds = connections
      .filter(
        (connection) =>
          Number(connection.requesterId) === userId ||
          Number(connection.receiverId) === userId,
      )
      .map((connection) =>
        Number(connection.requesterId) === userId
          ? Number(connection.receiverId)
          : Number(connection.requesterId),
      );

    console.log('[FEED] Connected User IDs:', connectedUserIds);

    // =====================================
    // 3. FETCH POSTS
    // =====================================

    const allPosts =
      personalizedPostIds.length > 0
        ? await this.prisma.client.orm.public.Post
          .where((p) => p.status.eq('PUBLISHED'))
          .where((p) => p.deletedAt.isNull())
          .where((p) => p.publishedAt.isNotNull())
          .where((p: any) =>
            p.id.in(personalizedPostIds),
          )
          .orderBy([
            (p) => p.createdAt.desc(),
            (p) => p.id.desc(),
          ])
          .all()
        : [];

    console.log(
      '[FEED] Fetched Posts:',
      allPosts.map((post) => ({
        id: Number(post.id),
        userId: Number(post.userId),
        status: post.status,
        moderation: post.moderation_status,
        visibility: post.visibility,
      })),
    );

    // =====================================
    // 4. MODERATION AND VISIBILITY FILTER
    // =====================================

    const visiblePosts = allPosts.filter((post) => {
      // Owner can see own posts
      if (Number(post.userId) === userId) {
        return true;
      }

      // Other users can only see approved posts
      if (post.moderation_status !== 'APPROVED') {
        return false;
      }

      if (post.visibility === 'PUBLIC') {
        return true;
      }

      if (post.visibility === 'CONNECTIONS') {
        return connectedUserIds.includes(Number(post.userId));
      }

      return false;
    });

    console.log(
      '[FEED] Visible Post IDs:',
      visiblePosts.map((post) => Number(post.id)),
    );

    // =====================================
    // 5. INITIAL OR EXPANDED FEED
    // =====================================

    let orderedPosts: typeof visiblePosts = [];

    if (personalizedFeed.feedMode === 'INITIAL') {
      // Existing INITIAL feed behavior
      orderedPosts = visiblePosts;
    } else {
      // =====================================
      // EXPANDED FEED: PERCENTAGE DISTRIBUTION
      // =====================================

      const postSkills =
        visiblePosts.length > 0
          ? await this.prisma.client.orm.public.PostSkill
            .where((item: any) =>
              item.postId.in(
                visiblePosts.map((post) => post.id),
              ),
            )
            .all()
          : [];

      const usedPostIds = new Set<number>();

      // Create skill-wise post buckets
      const buckets = personalizedFeed.skillDistribution.map(
        (distribution) => {
          const categorySkillIds = new Set(
            distribution.categorySkillIds,
          );

          const bucketPosts = visiblePosts.filter((post) => {
            const matchingSkills = postSkills.filter(
              (item: any) =>
                Number(item.postId) === Number(post.id),
            );

            return matchingSkills.some(
              (item: any) =>
                categorySkillIds.has(Number(item.skillId)),
            );
          });

          return {
            skillId: distribution.skillId,
            skillName: distribution.skillName,
            points: distribution.points,
            postQuota: distribution.postQuota,
            posts: bucketPosts,
          };
        },
      );

      // =====================================
      // BUILD WEIGHTED FEED
      // =====================================

      const postIndexes = buckets.map(() => 0);

      const finalFeed: typeof visiblePosts = [];

      const getNextPost = (bucketIndex: number) => {
        const bucket = buckets[bucketIndex];

        while (
          postIndexes[bucketIndex] < bucket.posts.length
        ) {
          const post =
            bucket.posts[postIndexes[bucketIndex]];

          postIndexes[bucketIndex]++;

          const postId = Number(post.id);

          if (!usedPostIds.has(postId)) {
            usedPostIds.add(postId);
            return post;
          }
        }

        return null;
      };

      // Create feed in batches of 10
      while (true) {
        const beforeCount = finalFeed.length;

        // First apply calculated quota
        for (let i = 0; i < buckets.length; i++) {
          const bucket = buckets[i];

          for (let j = 0; j < bucket.postQuota; j++) {
            const post = getNextPost(i);

            if (post) {
              finalFeed.push(post);
            }
          }
        }

        // Fill remaining slots if some buckets have fewer posts
        while (finalFeed.length - beforeCount < pageSize) {
          let selectedPost:
            (typeof visiblePosts)[number] | null = null;

          // Try higher-point skills first
          for (let i = 0; i < buckets.length; i++) {
            selectedPost = getNextPost(i);

            if (selectedPost) {
              break;
            }
          }

          if (!selectedPost) {
            break;
          }

          finalFeed.push(selectedPost);
        }

        // Stop if no new post was added
        if (finalFeed.length === beforeCount) {
          break;
        }
      }

      orderedPosts = finalFeed;
    }

    console.log(
      '[FEED] Ordered Post IDs:',
      orderedPosts.map((post) => Number(post.id)),
    );

    // =====================================
    // 6. CURSOR PAGINATION
    // =====================================

    if (normalizedCursor !== undefined) {
      const cursorIndex = orderedPosts.findIndex(
        (post) => Number(post.id) === normalizedCursor,
      );

      if (cursorIndex === -1) {
        throw new NotFoundException(
          'Feed cursor post not found',
        );
      }

      orderedPosts = orderedPosts.slice(cursorIndex + 1);
    }

    const posts = orderedPosts.slice(0, pageSize + 1);

    const hasMore = posts.length > pageSize;

    const items = posts.slice(0, pageSize);

    const postIds = items.map((post) => post.id);

    // =====================================
    // 7. FETCH USERS
    // =====================================

    const userIds = [
      ...new Set(items.map((post) => Number(post.userId))),
    ];

    const users =
      userIds.length > 0
        ? await this.prisma.client.orm.public.User
          .where((user) => user.id.in(userIds))
          .all()
        : [];

    const userProfiles =
      userIds.length > 0
        ? await this.prisma.client.orm.public.UserProfile
          .where((profile) =>
            profile.userId.in(userIds),
          )
          .all()
        : [];

    // =====================================
    // 8. FETCH MEDIA
    // =====================================

    const media =
      postIds.length > 0
        ? await this.prisma.client.orm.public.PostMedia
          .where((item) => item.postId.in(postIds))
          .orderBy((item) => item.position.asc())
          .all()
        : [];

    // =====================================
    // 9. FETCH POST SKILLS
    // =====================================

    const postSkills =
      postIds.length > 0
        ? await this.prisma.client.orm.public.PostSkill
          .where((item: any) =>
            item.postId.in(postIds),
          )
          .all()
        : [];

    const skillIds = [
      ...new Set(
        postSkills.map(
          (item: any) => Number(item.skillId),
        ),
      ),
    ];

    const skills =
      skillIds.length > 0
        ? await this.prisma.client.orm.public.Skill
          .where((skill: any) =>
            skill.id.in(skillIds),
          )
          .all()
        : [];

    // =====================================
    // 10. ATTACH MEDIA AND COUNTS
    // =====================================

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

          user: {
            name:
              users.find(
                (user) =>
                  Number(user.id) === Number(post.userId),
              )?.name ?? null,

            avatarUrl:
              userProfiles.find(
                (profile) =>
                  Number(profile.userId) === Number(post.userId),
              )?.avatarUrl ?? null,
          },

          media: media.filter(
            (item) =>
              Number(item.postId) === Number(post.id),
          ),

          skills: postSkills
            .filter(
              (postSkill: any) =>
                Number(postSkill.postId) === Number(post.id),
            )
            .map((postSkill: any) => {
              const skill = skills.find(
                (item: any) =>
                  Number(item.id) === Number(postSkill.skillId),
              );

              return skill
                ? {
                  skillId: Number(skill.id),
                  skillName: String(skill.name),
                }
                : null;
            })
            .filter((skill) => skill !== null),

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

    // =====================================
    // 11. RESPONSE
    // =====================================

    const lastPost = items[items.length - 1];

    console.log(
      '[FEED] Final Post IDs:',
      items.map((post) => Number(post.id)),
    );

    console.log('[FEED] Has More:', hasMore);
    console.log('========== FEED REQUEST END ==========');

    return {
      success: true,

      feedMode: personalizedFeed.feedMode,

      highlightedSkill: personalizedFeed.highlightedSkill,

      skillDistribution:
        personalizedFeed.skillDistribution.map((item) => ({
          skillId: item.skillId,
          skillName: item.skillName,
          points: item.points,
          percentage: item.percentage,
          postsPer10: item.postQuota,
        })),

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

  async getMyPostsEngagementCounts(userId: number) {
    const myPosts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(userId))
      .where((post) => post.deletedAt.isNull())
      .all();

    const postIds = myPosts.map((post) => post.id);

    if (postIds.length === 0) {
      return {
        success: true,
        data: {
          appreciateCount: 0,
          helpfulCount: 0,
          learnedCount: 0,
        },
      };
    }

    const reactions = await this.prisma.client.orm.public.PostReaction
      .where((reaction) => reaction.postId.in(postIds))
      .all();

    const learningRecords = await this.prisma.client.orm.public.PostLearning
      .where((learning) => learning.postId.in(postIds))
      .all();

    return {
      success: true,
      data: {
        appreciateCount: reactions.filter(
          (reaction) => reaction.reactionType === 'APPRECIATE',
        ).length,

        helpfulCount: reactions.filter(
          (reaction) => reaction.reactionType === 'HELPFUL',
        ).length,

        learnedCount: learningRecords.length,
      },
    };
  }

  async getMyPostsLearnedCount(userId: number) {
    const myPosts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(userId))
      .where((post) => post.deletedAt.isNull())
      .all();

    const postIds = myPosts.map((post) => post.id);

    if (postIds.length === 0) {
      return {
        success: true,
        data: {
          learnedCount: 0,
        },
      };
    }

    const learningRecords =
      await this.prisma.client.orm.public.PostLearning
        .where((learning) => learning.postId.in(postIds))
        .all();

    return {
      success: true,
      data: {
        learnedCount: learningRecords.length,
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

    // Check only the same reaction type
    const existingReaction =
      await this.prisma.client.orm.public.PostReaction
        .where({
          postId,
          userId,
          reactionType,
        })
        .first();

    let reaction;

    // Add only if this reaction does not already exist
    if (!existingReaction) {
      reaction =
        await this.prisma.client.orm.public.PostReaction.create({
          postId,
          userId,
          reactionType,
        });
    } else {
      reaction = existingReaction;
    }

    // Get updated reaction counts
    const reactions =
      await this.prisma.client.orm.public.PostReaction
        .where({ postId })
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

    // Get all reactions made by the logged-in user
    const myReactions = reactions
      .filter((reaction) => reaction.userId === userId)
      .map((reaction) => reaction.reactionType);

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

      myReactions,
    };
  }

  // =====================================
  // GET POST LEARNING DETAILS
  // =====================================

  async getPostLearning(
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

    const learningRecords =
      await this.prisma.client.orm.public.PostLearning
        .where({
          postId,
        })
        .all();

    const myLearning = learningRecords.find(
      (learning) => learning.userId === userId,
    );

    return {
      success: true,
      postId,
      learningCount: learningRecords.length,
      isLearned: !!myLearning,
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


  async deletePost(postId: number, userId: number) {
    // Check that this post belongs to the logged-in user
    const post = await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        userId: userId,
        deletedAt: null,
      })
      .first();

    if (!post) {
      throw new NotFoundException(
        'Post not found or you do not have permission to delete it',
      );
    }

    // Soft delete: mark the post as deleted
    await this.prisma.client.orm.public.Post
      .where({
        id: postId,
        userId: userId,
        deletedAt: null,
      })
      .update({
        deletedAt: Temporal.Now.instant(),
      });

    // Notify connected clients
    this.postsGateway.emitPostUpdate({
      type: 'POST_DELETED',
      postId,
      userId,
    });

    return {
      success: true,
      message: 'Post deleted successfully',
    };
  }

}
