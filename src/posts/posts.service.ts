
import {
    Injectable,
    Inject,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';

import { Temporal } from '@js-temporal/polyfill';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

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
    ) { }

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
            'image/jpeg', // .jpg, .jpeg
            'image/png',  // .png
            'image/webp', // .webp
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
            'video/mp4',          // .mp4
            'video/webm',         // .webm
            'video/quicktime',    // .mov
            'video/x-msvideo',    // .avi
            'video/x-matroska',   // .mkv
            'video/3gpp',         // .3gp
            'video/ogg',          // .ogv
            'video/x-flv',        // .flv
            'video/mpeg',         // .mpeg, .mpg
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
                        reject(
                            new Error('Cloudinary returned no image URL'),
                        );
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
                        reject(
                            new Error('Cloudinary returned no video URL'),
                        );
                        return;
                    }

                    resolve(result.secure_url);
                },
            );

            stream.end(buffer);
        });
    }

    // =====================================
    // SAVE MEDIA DETAILS TO DATABASE
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

            return {
                success: true,
                message: 'Post created successfully with image',
                post,
                media,
            };
        } catch (error) {
            console.error('Create post with image failed:', error);

            throw new InternalServerErrorException(
                'Post was created, but image upload or media saving failed',
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

            return {
                success: true,
                message: 'Post created successfully with video',
                post,
                media,
            };
        } catch (error) {
            console.error('Create post with video failed:', error);

            throw new InternalServerErrorException(
                'Post was created, but video upload or media saving failed',
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
            console.error(
                'Post image Cloudinary upload failed:',
                error,
            );

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

            return {
                success: true,
                message: 'Post image uploaded successfully',
                media,
            };
        } catch (error) {
            console.error(
                'Failed to save post image details:',
                error,
            );

            throw new InternalServerErrorException(
                'Image uploaded, but failed to save image details',
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
            .replace(/[/\\]/g, '_')
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
                        reject(
                            new Error('Cloudinary returned no document URL'),
                        );
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

            return {
                success: true,
                message: 'Document post created successfully',
                post,
                media,
            };
        } catch (error) {
            console.error('Create post with document failed:', error);

            throw new InternalServerErrorException(
                'Post was created, but document upload or database saving failed',
            );
        }
    }

}
