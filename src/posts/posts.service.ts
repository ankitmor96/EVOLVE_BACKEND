
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

  // =====================================
  // ADD VIDEO MODERATION JOB TO QUEUE
  // =====================================

  async enqueueVideoModerationJob(
    postId: number,
    userId: number,
  ) {
    console.log('Adding video moderation job to queue:', {
      postId,
      userId,
    });

    return this.postsQueue.add(
      'video-moderation-created',
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
      await this.enqueueVideoModerationJob(postId, userId);

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

    blockedPostIds: number[];

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

    // =====================================
    // 48 HOURS EXPLORED POST BLOCK
    // =====================================

    const now = Date.now();

    const fortyEightHoursInMs =
      48 * 60 * 60 * 1000;

    const blockedPostIds = [
      ...new Set(
        explorations
          .filter((item: any) => {
            const lastExploredAt =
              Number(item.lastExploredAt.epochMilliseconds);

            return (
              now - lastExploredAt < fortyEightHoursInMs &&
              now >= lastExploredAt
            );
          })
          .map((item: any) => Number(item.postId)),
      ),
    ];

    const uniqueExploredPosts = new Set(
      explorations.map((item: any) => Number(item.postId)),
    );

    // 2. Get onboarding skills
    // const userSkills =
    //   await this.prisma.client.orm.public.UserSkill
    //     .where({
    //       userId,
    //       relationshipType: {
    //         in: ['CAN_DO', 'LEARNING', 'WANT_TO_IMPROVE'],
    //       },
    //     })
    //     .all();
    const userSkills =
      await this.prisma.client.orm.public.UserSkill
        .where({
          userId: Number(userId),
        })
        .all();

    console.log('[FEED DEBUG] User ID:', userId);
    console.log('[FEED DEBUG] Raw UserSkills:', userSkills);

    // 3. Get active skills
    const activeSkills =
      await this.prisma.client.orm.public.Skill
        .where({ isActive: true })
        .all();

    const activeSkillIds = new Set(
      activeSkills.map((skill: any) => Number(skill.id)),
    );
    // console.log("Active Skills:", activeSkillIds);

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
    // console.log("[FEED DEBUG] Raw UserSkills:", userSkills)

    // 5. Before 10 unique explorations: INITIAL feed
    if (uniqueExploredPosts.size < 10) {
      return {
        skillIds: onboardingSkillIds,
        feedMode: 'INITIAL',
        highlightedSkill: null,
        blockedPostIds,
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
        blockedPostIds,
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
      blockedPostIds,
      skillDistribution,
    };
  }

  async getFeed(userId: number, cursor?: string) {
    userId = Number(userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    const offset = cursor === undefined ? 0 : Number(cursor);

    if (
      !Number.isInteger(offset) ||
      offset < 0
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
      await this.prisma.client.orm.public.Post
        .where((p) => p.status.eq('PUBLISHED'))
        .where((p) => p.deletedAt.isNull())
        .where((p) => p.publishedAt.isNotNull())
        .orderBy([
          (p) => p.createdAt.desc(),
          (p) => p.id.desc(),
        ])
        .all();

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

    let visiblePosts = allPosts.filter((post) => {
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

    const blockedPostIdSet = new Set(
      personalizedFeed.blockedPostIds.map(Number),
    );

    visiblePosts = visiblePosts.filter(
      (post) => !blockedPostIdSet.has(Number(post.id)),
    );

    console.log(
      '[FEED] 48-Hour Blocked Post IDs:',
      personalizedFeed.blockedPostIds,
    );

    console.log(
      '[FEED] Visible Post IDs:',
      visiblePosts.map((post) => Number(post.id)),
    );


    // =====================================
    // RANDOM SHUFFLE HELPER
    // =====================================

    const shufflePosts = <T>(posts: T[]): T[] => {
      const shuffled = [...posts];

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] = [
          shuffled[j],
          shuffled[i],
        ];
      }

      return shuffled;
    };



    // =====================================
    // 5. INITIAL OR EXPANDED FEED
    // =====================================

    let orderedPosts: typeof visiblePosts = [];

    if (personalizedFeed.feedMode === 'INITIAL') {

      console.log('========== INITIAL FEED START ==========');

      const matchingPostIdSet = new Set(
        personalizedPostIds.map(Number),
      );

      const skillMatchedPosts = visiblePosts.filter(
        (post) =>
          matchingPostIdSet.has(Number(post.id)),
      );

      const allPostIds = visiblePosts.map(
        (post) => Number(post.id),
      );

      const allReactions =
        allPostIds.length > 0
          ? await this.prisma.client.orm.public.PostReaction
            .where((item: any) =>
              item.postId.in(allPostIds),
            )
            .all()
          : [];

      const engagementScores = visiblePosts.map((post) => {

        const postId = Number(post.id);

        const appreciateCount = allReactions.filter(
          (reaction: any) =>
            Number(reaction.postId) === postId &&
            reaction.reactionType === 'APPRECIATE',
        ).length;

        const helpfulCount = allReactions.filter(
          (reaction: any) =>
            Number(reaction.postId) === postId &&
            reaction.reactionType === 'HELPFUL',
        ).length;

        return {
          post,
          score: appreciateCount + helpfulCount,
        };
      });

      const usedPostIds = new Set<number>();

      const finalFeed: typeof visiblePosts = [];

      let batchIndex = 0;

      while (true) {

        const skillBatch: typeof visiblePosts = [];
        const engagementBatch: typeof visiblePosts = [];

        // =====================================
        // 1. SELECT 6 SKILL POSTS
        // =====================================

        const remainingSkillPosts = skillMatchedPosts.filter(
          (post) =>
            !usedPostIds.has(Number(post.id)),
        );

        // Randomly shuffle skill posts
        const shuffledSkillPosts = shufflePosts(remainingSkillPosts);

        // Select 6 random skill posts
        const selectedSkillPosts = shuffledSkillPosts.slice(0, 6);

        for (const post of selectedSkillPosts) {
          usedPostIds.add(Number(post.id));
          skillBatch.push(post);
        }


        // =====================================
        // 2. GET ALL REMAINING ENGAGEMENT POSTS
        // =====================================

        const remainingEngagementPosts = engagementScores.filter(
          (item) =>
            !usedPostIds.has(Number(item.post.id)),
        );

        // =====================================
        // 3. RANDOMLY SELECT 4 POSTS
        // 0 REACTION POSTS ALSO INCLUDED
        // =====================================

        const randomlySelectedEngagementPosts = shufflePosts(
          remainingEngagementPosts,
        ).slice(0, 4);

        // =====================================
        // 4. SORT SELECTED POSTS BY REACTION SCORE
        // HIGH REACTIONS FIRST, ZERO LAST
        // =====================================

        const selectedEngagementPosts =
          randomlySelectedEngagementPosts.sort(
            (a, b) => b.score - a.score,
          );

        // =====================================
        // 5. ADD 4 ENGAGEMENT POSTS
        // =====================================

        for (const item of selectedEngagementPosts) {
          const postId = Number(item.post.id);

          if (!usedPostIds.has(postId)) {
            usedPostIds.add(postId);
            engagementBatch.push(item.post);
          }
        }


        // =====================================
        // 5. FINAL BATCH
        // NO FALLBACK
        // =====================================

        const currentBatch = [
          ...skillBatch,
          ...engagementBatch,
        ];

        if (currentBatch.length === 0) {
          break;
        }

        finalFeed.push(...currentBatch);

        console.log(
          `[INITIAL] Batch ${batchIndex + 1}:`,
          {
            skillPosts: skillBatch.map((p) => Number(p.id)),
            engagementPosts: engagementBatch.map((p) => Number(p.id)),
            totalPosts: currentBatch.length,
          },
        );

        batchIndex++;
      }

      orderedPosts = finalFeed;

      console.log(
        '[INITIAL] Final Ordered Post IDs:',
        orderedPosts.map((post) => Number(post.id)),
      );

      console.log('========== INITIAL FEED END ==========');

    } else {


      console.log('========== EXPANDED FEED START ==========');
      console.log('[EXPANDED] Applying 6 Skill + 4 Engagement Algorithm');

      // =====================================
      // A. FETCH POST SKILLS
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

      // =====================================
      // B. CREATE SKILL BUCKETS
      // =====================================

      const buckets = personalizedFeed.skillDistribution.map(
        (distribution) => {

          const categorySkillIds = new Set(
            distribution.categorySkillIds.map(Number),
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
            percentage: distribution.percentage,
            posts: shufflePosts(bucketPosts),
          };
        },
      );

      // =====================================
      // C. CALCULATE SKILL QUOTA OUT OF 6
      // =====================================

      const skillQuotaData = buckets.map((bucket) => {
        const exactQuota =
          (bucket.percentage / 100) * 6;

        return {
          ...bucket,
          postQuota: Math.floor(exactQuota),
          remainder: exactQuota - Math.floor(exactQuota),
        };
      });

      const remainingSkillSlots =
        6 -
        skillQuotaData.reduce(
          (total, item) => total + item.postQuota,
          0,
        );

      const remainderOrder = [...skillQuotaData].sort(
        (a, b) => {
          const difference = b.remainder - a.remainder;

          return difference !== 0
            ? difference
            : b.points - a.points;
        },
      );

      for (let i = 0; i < remainingSkillSlots; i++) {
        const selected = remainderOrder[i];

        if (selected) {
          selected.postQuota += 1;
        }
      }

      console.log(
        '[EXPANDED] Skill Quotas Out Of 6:',
        skillQuotaData.map((item) => ({
          skill: item.skillName,
          points: item.points,
          percentage: item.percentage,
          quota: item.postQuota,
        })),
      );

      // =====================================
      // D. TRACK USED POSTS
      // =====================================

      const usedPostIds = new Set<number>();

      const postIndexes = skillQuotaData.map(() => 0);

      // =====================================
      // E. STABLE RANDOM RANK
      // =====================================

      // const stableRank = (
      //   postId: number,
      //   batchIndex: number,
      // ): number => {
      //   const value = `${userId}:${batchIndex}:${postId}`;

      //   let hash = 2166136261;

      //   for (let i = 0; i < value.length; i++) {
      //     hash ^= value.charCodeAt(i);
      //     hash = Math.imul(hash, 16777619);
      //   }

      //   return hash >>> 0;
      // };

      // =====================================
      // F. GET NEXT SKILL POST
      // =====================================

      const getNextSkillPost = (
        bucketIndex: number,
      ): (typeof visiblePosts)[number] | null => {

        const bucket = skillQuotaData[bucketIndex];

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

      // =====================================
      // G. FETCH ALL REACTIONS
      // =====================================

      const allPostIds = visiblePosts.map(
        (post) => Number(post.id),
      );

      const allReactions =
        allPostIds.length > 0
          ? await this.prisma.client.orm.public.PostReaction
            .where((item: any) =>
              item.postId.in(allPostIds),
            )
            .all()
          : [];

      // =====================================
      // H. CALCULATE ENGAGEMENT SCORE
      // APPRECIATE + HELPFUL ONLY
      // =====================================

      const engagementScores = visiblePosts.map((post) => {
        const postId = Number(post.id);

        const appreciateCount = allReactions.filter(
          (reaction: any) =>
            Number(reaction.postId) === postId &&
            reaction.reactionType === 'APPRECIATE',
        ).length;

        const helpfulCount = allReactions.filter(
          (reaction: any) =>
            Number(reaction.postId) === postId &&
            reaction.reactionType === 'HELPFUL',
        ).length;

        return {
          post,
          appreciateCount,
          helpfulCount,
          score: appreciateCount + helpfulCount,
        };
      });

      // =====================================
      // I. BUILD FEED IN BATCHES OF 10
      // 6 SKILL + 4 ENGAGEMENT
      // =====================================

      const finalFeed: typeof visiblePosts = [];

      let batchIndex = 0;

      while (true) {
        const beforeCount = finalFeed.length;

        const skillBatch: typeof visiblePosts = [];
        const engagementBatch: typeof visiblePosts = [];

        // =====================================
        // 1. SELECT 6 SKILL POSTS
        // =====================================

        for (let i = 0; i < skillQuotaData.length; i++) {
          const bucket = skillQuotaData[i];

          for (let j = 0; j < bucket.postQuota; j++) {
            const post = getNextSkillPost(i);

            if (post) {
              skillBatch.push(post);
            }
          }
        }

        // =====================================
        // 2. FILL MISSING SKILL SLOTS
        // =====================================

        while (skillBatch.length < 6) {
          let selectedPost:
            (typeof visiblePosts)[number] | null = null;

          for (let i = 0; i < skillQuotaData.length; i++) {
            selectedPost = getNextSkillPost(i);

            if (selectedPost) {
              break;
            }
          }

          if (!selectedPost) {
            break;
          }

          skillBatch.push(selectedPost);
        }

        // =====================================
        // 3. GET ALL REMAINING ENGAGEMENT POSTS
        // =====================================

        const remainingEngagementPosts =
          engagementScores.filter(
            (item) =>
              !usedPostIds.has(Number(item.post.id)),
          );

        // =====================================
        // 4. RANDOMLY SELECT 4 POSTS
        // 0 REACTION POSTS ALSO INCLUDED
        // =====================================

        const randomlySelectedEngagementPosts =
          shufflePosts(remainingEngagementPosts).slice(0, 4);

        // =====================================
        // 5. SORT SELECTED POSTS BY REACTION SCORE
        // HIGH REACTIONS FIRST, ZERO LAST
        // =====================================

        const selectedEngagementPosts =
          randomlySelectedEngagementPosts.sort(
            (a, b) => b.score - a.score,
          );

        // =====================================
        // 6. ADD 4 ENGAGEMENT POSTS
        // =====================================

        for (const item of selectedEngagementPosts) {
          const postId = Number(item.post.id);

          if (!usedPostIds.has(postId)) {
            usedPostIds.add(postId);
            engagementBatch.push(item.post);
          }
        }


        // // =====================================
        // // 6. FILL REMAINING SLOTS
        // // =====================================

        // const missingSlots =
        //   pageSize -
        //   skillBatch.length -
        //   engagementBatch.length;

        // if (missingSlots > 0) {
        //   const remainingFallbackPosts =
        //     visiblePosts
        //       .filter(
        //         (post) =>
        //           !usedPostIds.has(Number(post.id)),
        //       )
        //       .sort(
        //         (a, b) =>
        //           stableRank(Number(a.id), batchIndex) -
        //           stableRank(Number(b.id), batchIndex),
        //       )
        //       .slice(0, missingSlots);

        //   for (const post of remainingFallbackPosts) {
        //     usedPostIds.add(Number(post.id));
        //     fallbackBatch.push(post);
        //   }
        // }

        // =====================================
        // 7. FINAL BATCH
        // =====================================

        const currentBatch = [
          ...skillBatch,
          ...engagementBatch,
        ];

        if (currentBatch.length === 0) {
          break;
        }

        finalFeed.push(...currentBatch);

        console.log(
          `[EXPANDED] Batch ${batchIndex + 1}:`,
          {
            skillPosts: skillBatch.map(
              (post) => Number(post.id),
            ),
            engagementPosts: engagementBatch.map(
              (post) => Number(post.id),
            ),
            totalPosts: currentBatch.length,
          },
        );

        batchIndex++;

        if (finalFeed.length === beforeCount) {
          break;
        }
      }

      orderedPosts = finalFeed;

      console.log(
        '[EXPANDED] Final Ordered Post IDs:',
        orderedPosts.map((post) => Number(post.id)),
      );

      console.log(
        '[EXPANDED] Total Posts:',
        orderedPosts.length,
      );

      console.log('========== EXPANDED FEED END ==========');
    }


    // =====================================
    // 6. OFFSET PAGINATION
    // =====================================

    const totalPosts = orderedPosts.length;

    const items = orderedPosts.slice(
      offset,
      offset + pageSize,
    );

    const nextOffset = offset + items.length;

    const hasMore = nextOffset < totalPosts;

    const nextCursor = hasMore
      ? String(nextOffset)
      : null;

    const postIds = items.map(
      (post) => Number(post.id),
    );

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
        nextCursor
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




  async getMyPostsDailyStats(userId: number) {

    // =====================================
    // GET TODAY DATE RANGE (IST)
    // =====================================

    const now = new Date();

    // IST = UTC + 5:30
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    const istNow = new Date(now.getTime() + IST_OFFSET_MS);

    const year = istNow.getUTCFullYear();
    const month = istNow.getUTCMonth();
    const day = istNow.getUTCDate();

    // Today's 00:00 IST converted to UTC
    const startOfToday = new Date(
      Date.UTC(year, month, day) - IST_OFFSET_MS,
    );

    // Tomorrow's 00:00 IST converted to UTC
    const startOfTomorrow = new Date(
      Date.UTC(year, month, day + 1) - IST_OFFSET_MS,
    );

    // Check whether record belongs to today (IST)
    const isToday = (createdAt: any): boolean => {

      const timestamp = new Date(
        String(createdAt),
      ).getTime();

      return (
        Number.isFinite(timestamp) &&
        timestamp >= startOfToday.getTime() &&
        timestamp < startOfTomorrow.getTime()
      );
    };

    // =====================================
    // GET MY POSTS
    // =====================================

    const myPosts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(userId))
      .where((post) => post.deletedAt.isNull())
      .all();

    // =====================================
    // FILTER ONLY TODAY'S POSTS
    // =====================================

    const todayPosts = myPosts.filter(
      (post) => isToday(post.createdAt),
    );

    const todayPostCount = todayPosts.length;

    // Only today's post IDs
    const postIds = todayPosts.map(
      (post) => post.id,
    );

    // =====================================
    // DEFAULT COUNTS
    // =====================================

    let appreciateCount = 0;
    let helpfulCount = 0;
    let learnedCount = 0;

    // =====================================
    // GET TODAY'S POST ENGAGEMENTS
    // =====================================

    if (postIds.length > 0) {

      // Get reactions only from today's posts
      const reactions = await this.prisma.client.orm.public.PostReaction
        .where((reaction) => reaction.postId.in(postIds))
        .all();

      // Only reactions created today
      const todayReactions = reactions.filter(
        (reaction) => isToday(reaction.createdAt),
      );

      // APPRECIATE count
      appreciateCount = todayReactions.filter(
        (reaction) => reaction.reactionType === 'APPRECIATE',
      ).length;

      // HELPFUL count
      helpfulCount = todayReactions.filter(
        (reaction) => reaction.reactionType === 'HELPFUL',
      ).length;

      // Get learning records only from today's posts
      const learningRecords = await this.prisma.client.orm.public.PostLearning
        .where((learning) => learning.postId.in(postIds))
        .all();

      // Only learning records created today
      learnedCount = learningRecords.filter(
        (learning) => isToday(learning.createdAt),
      ).length;
    }

    // =====================================
    // RESPONSE
    // =====================================

    return {
      success: true,
      data: {
        todayPostCount,
        appreciateCount,
        helpfulCount,
        learnedCount,
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

  // =====================================
  // GET POSTS BY PROFILE USER ID
  // =====================================

  async getProfilePosts(
    viewerId: number,
    profileUserId: number,
    cursor?: number,
  ) {
    const pageSize = 10;

    if (
      !Number.isInteger(viewerId) ||
      viewerId <= 0 ||
      !Number.isInteger(profileUserId) ||
      profileUserId <= 0
    ) {
      throw new BadRequestException('Invalid user ID');
    }

    // Check whether the profile owner exists.
    const profileUser = await this.prisma.client.orm.public.User
      .where((user) => user.id.eq(profileUserId))
      .first();

    if (!profileUser) {
      throw new NotFoundException('Profile user not found');
    }

    // Check accepted connection between viewer and profile owner.
    const connections =
      await this.prisma.client.orm.public.Connection
        .where((connection) =>
          connection.status.eq('ACCEPTED'),
        )
        .all();

    const isConnected = connections.some(
      (connection) =>
        (connection.requesterId === viewerId &&
          connection.receiverId === profileUserId) ||
        (connection.requesterId === profileUserId &&
          connection.receiverId === viewerId),
    );

    // Fetch only the selected profile user's posts.
    const allPosts = await this.prisma.client.orm.public.Post
      .where((post) => post.userId.eq(profileUserId))
      .where((post) => post.status.eq('PUBLISHED'))
      .where((post) => post.deletedAt.isNull())
      .where((post) => post.publishedAt.isNotNull())
      .orderBy([
        (post) => post.createdAt.desc(),
        (post) => post.id.desc(),
      ])
      .all();

    // Apply visibility and moderation rules.
    const visiblePosts = allPosts.filter((post) => {
      // Profile owner can see their own posts.
      if (viewerId === profileUserId) {
        return true;
      }

      // Other users can only see approved posts.
      if (post.moderation_status !== 'APPROVED') {
        return false;
      }

      // Public posts are visible to everyone.
      if (post.visibility === 'PUBLIC') {
        return true;
      }

      // Connections-only posts require accepted connection.
      if (post.visibility === 'CONNECTIONS') {
        return isConnected;
      }

      return false;
    });

    // Cursor pagination.
    let startIndex = 0;

    if (cursor !== undefined) {
      if (!Number.isInteger(cursor) || cursor <= 0) {
        throw new BadRequestException('Invalid profile posts cursor');
      }

      const cursorIndex = visiblePosts.findIndex(
        (post) => post.id === cursor,
      );

      if (cursorIndex === -1) {
        throw new NotFoundException(
          'Profile posts cursor not found',
        );
      }

      startIndex = cursorIndex + 1;
    }

    const items = visiblePosts.slice(
      startIndex,
      startIndex + pageSize,
    );

    const hasMore =
      visiblePosts.length > startIndex + pageSize;

    const postIds = items.map((post) => post.id);

    // Fetch profile information.
    const userProfile =
      await this.prisma.client.orm.public.UserProfile
        .where((profile) => profile.userId.eq(profileUserId))
        .first();

    // Fetch media.
    const media = postIds.length > 0
      ? await this.prisma.client.orm.public.PostMedia
        .where((item) => item.postId.in(postIds))
        .orderBy((item) => item.position.asc())
        .all()
      : [];

    // Attach media and engagement counts.
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
            name: profileUser.name ?? null,
            avatarUrl: userProfile?.avatarUrl ?? null,
          },

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
      profileUserId,
      data: itemsWithMedia,

      pagination: {
        limit: pageSize,
        hasMore,
        nextCursor: hasMore && lastPost
          ? lastPost.id
          : null,
      },
    };
  }


  async getLearningSkillStats(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    // 1. Get only LEARNING skills of logged-in user
    const userSkills =
      await this.prisma.client.orm.public.UserSkill
        .where({
          userId,
          relationshipType: 'LEARNING',
        })
        .all();

    if (userSkills.length === 0) {
      return {
        success: true,
        totalSkills: 0,
        data: [],
      };
    }

    const skillIds = [
      ...new Set(
        userSkills.map((item: any) => Number(item.skillId)),
      ),
    ];

    // 2. Fetch skill details
    const skills =
      await this.prisma.client.orm.public.Skill
        .where((skill: any) => skill.id.in(skillIds))
        .all();

    // 3. Get user's unique explored posts
    const explorations =
      await this.prisma.client.orm.public.UserPostExploration
        .where({ userId })
        .all();

    const exploredPostIds = [
      ...new Set(
        explorations.map((item: any) => Number(item.postId)),
      ),
    ];

    // 4. Get PostSkill mapping
    const postSkills =
      exploredPostIds.length > 0
        ? await this.prisma.client.orm.public.PostSkill
          .where((item: any) =>
            item.postId.in(exploredPostIds),
          )
          .all()
        : [];

    // 5. Get only posts matching user's LEARNING skills
    const matchingPostSkills = postSkills.filter(
      (item: any) =>
        skillIds.includes(Number(item.skillId)),
    );

    const matchingPostIds = [
      ...new Set(
        matchingPostSkills.map(
          (item: any) => Number(item.postId),
        ),
      ),
    ];

    // 6. Fetch reactions for matching explored posts
    const reactions =
      matchingPostIds.length > 0
        ? await this.prisma.client.orm.public.PostReaction
          .where((item: any) =>
            item.postId.in(matchingPostIds),
          )
          .all()
        : [];

    // 7. Fetch learned records for matching explored posts
    const learningRecords =
      matchingPostIds.length > 0
        ? await this.prisma.client.orm.public.PostLearning
          .where((item: any) =>
            item.postId.in(matchingPostIds),
          )
          .all()
        : [];

    // 8. Prepare skill-wise statistics
    const data = skills
      .filter((skill: any) =>
        skillIds.includes(Number(skill.id)),
      )
      .map((skill: any) => {
        const skillId = Number(skill.id);

        // All unique explored posts belonging to this skill
        const skillPostIds = new Set(
          matchingPostSkills
            .filter(
              (item: any) =>
                Number(item.skillId) === skillId,
            )
            .map((item: any) => Number(item.postId)),
        );

        const postIds = [...skillPostIds];

        // Count APPRECIATE reactions
        const appreciateCount = reactions.filter(
          (item: any) =>
            skillPostIds.has(Number(item.postId)) &&
            item.reactionType === 'APPRECIATE',
        ).length;

        // Count HELPFUL reactions
        const helpfulCount = reactions.filter(
          (item: any) =>
            skillPostIds.has(Number(item.postId)) &&
            item.reactionType === 'HELPFUL',
        ).length;

        // Count LEARNED records
        const learnedCount = learningRecords.filter(
          (item: any) =>
            skillPostIds.has(Number(item.postId)),
        ).length;

        return {
          skillId,
          skillName: skill.name,

          exploredPostCount: postIds.length,

          reactionRanking: {
            APPRECIATE: appreciateCount,
            HELPFUL: helpfulCount,
            LEARNED: learnedCount,
          },
        };
      });

    return {
      success: true,
      totalSkills: data.length,
      data,
    };
  }



  async getRecentlyLearnedPosts(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }

    // 1. Get logged-in user's LEARNING skills
    const userSkills =
      await this.prisma.client.orm.public.UserSkill
        .where({
          userId,
          relationshipType: 'LEARNING',
        })
        .all();

    if (userSkills.length === 0) {
      return {
        success: true,
        totalPosts: 0,
        data: [],
      };
    }

    const skillIds = [
      ...new Set(userSkills.map((item: any) => Number(item.skillId))),
    ];

    // 2. Get user's learned posts
    const learningRecords =
      await this.prisma.client.orm.public.PostLearning
        .where({ userId })
        .orderBy((item: any) => item.createdAt.desc())
        .all();

    if (learningRecords.length === 0) {
      return {
        success: true,
        totalPosts: 0,
        data: [],
      };
    }

    const learnedPostIds = [
      ...new Set(
        learningRecords.map((item: any) => Number(item.postId)),
      ),
    ];

    // 3. Find posts linked with user's LEARNING skills
    const postSkills =
      await this.prisma.client.orm.public.PostSkill
        .where((item: any) =>
          item.postId.in(learnedPostIds),
        )
        .all();

    const matchingPostSkills = postSkills.filter(
      (item: any) => skillIds.includes(Number(item.skillId)),
    );

    const matchingPostIds = new Set(
      matchingPostSkills.map(
        (item: any) => Number(item.postId),
      ),
    );

    // 4. Keep only matching learning records
    const filteredLearningRecords = learningRecords.filter(
      (item: any) =>
        matchingPostIds.has(Number(item.postId)),
    );

    if (filteredLearningRecords.length === 0) {
      return {
        success: true,
        totalPosts: 0,
        data: [],
      };
    }

    const postIds = [
      ...new Set(
        filteredLearningRecords.map(
          (item: any) => Number(item.postId),
        ),
      ),
    ];

    // 5. Fetch post details
    const posts =
      await this.prisma.client.orm.public.Post
        .where((post: any) => post.id.in(postIds))
        .all();

    // 6. Fetch skill details
    const skills =
      await this.prisma.client.orm.public.Skill
        .where((skill: any) => skill.id.in(skillIds))
        .all();

    // 7. Fetch post media
    const media =
      await this.prisma.client.orm.public.PostMedia
        .where((item: any) => item.postId.in(postIds))
        .orderBy((item: any) => item.position.asc())
        .all();

    // 8. Calculate relative time
    const getTimeAgo = (date: any): string => {
      let timestamp: number;

      // Handle JavaScript Date
      if (date instanceof Date) {
        timestamp = date.getTime();
      }

      // Handle Temporal.Instant
      else if (
        date &&
        typeof date.epochMilliseconds === 'number'
      ) {
        timestamp = date.epochMilliseconds;
      }

      // Handle ISO string or timestamp
      else {
        timestamp = new Date(String(date)).getTime();
      }

      if (!Number.isFinite(timestamp)) {
        return 'Unknown';
      }

      const seconds = Math.max(
        0,
        Math.floor((Date.now() - timestamp) / 1000),
      );

      if (seconds < 60) return 'Just now';

      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;

      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;

      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;

      const weeks = Math.floor(days / 7);
      if (days < 30) return `${weeks}w ago`;

      const months = Math.floor(days / 30);
      if (days < 365) return `${months}mo ago`;

      const years = Math.floor(days / 365);
      return `${years}y ago`;
    };

    // 9. Prepare recently learned posts
    const data = filteredLearningRecords.map((record: any) => {
      const postId = Number(record.postId);

      const post = posts.find(
        (item: any) => Number(item.id) === postId,
      );

      const postSkillIds = matchingPostSkills
        .filter(
          (item: any) => Number(item.postId) === postId,
        )
        .map((item: any) => Number(item.skillId));

      const skillNames = skills
        .filter((skill: any) =>
          postSkillIds.includes(Number(skill.id)),
        )
        .map((skill: any) => skill.name);

      return {
        postId,
        caption: post?.caption ?? null,
        postType: post?.postType ?? null,

        skills: skillNames,

        media: media
          .filter(
            (item: any) => Number(item.postId) === postId,
          )
          .map((item: any) => ({
            mediaType: item.mediaType,
            mediaUrl: item.mediaUrl,
            thumbnailUrl: item.thumbnailUrl,
          })),

        learnedAt: record.createdAt,
        timeAgo: getTimeAgo(record.createdAt),
      };
    }).filter((item: any) => item.postId && posts.some(
      (post: any) => Number(post.id) === item.postId,
    ));

    return {
      success: true,
      totalPosts: data.length,
      data,
    };
  }

}
