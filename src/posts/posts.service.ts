
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
        file: {
            buffer: Buffer;
            mimetype: string;
            size: number;
        } | undefined,
    ): asserts file is {
        buffer: Buffer;
        mimetype: string;
        size: number;
    } {
        if (!file?.buffer || !file.size) {
            throw new BadRequestException(
                'Please select an image',
            );
        }

        const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Only JPG, PNG and WEBP images are allowed',
            );
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new BadRequestException(
                'Image size must not exceed 5 MB',
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
            const stream =
                this.cloudinaryClient.uploader.upload_stream(
                    {
                        folder: `evolv/posts/${postId}`,
                        resource_type: 'image',
                    },
                    (error, result) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        if (!result?.secure_url) {
                            reject(
                                new Error(
                                    'Cloudinary returned no image URL',
                                ),
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
    // SAVE IMAGE DETAILS TO DATABASE
    // =====================================

    private async savePostMedia(
        postId: number,
        mediaUrl: string,
    ) {
        return this.prisma.client.orm.public.PostMedia.create({
            postId,
            mediaType: 'IMAGE',
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
        file: {
            buffer: Buffer;
            mimetype: string;
            size: number;
        } | undefined,
    ) {
        // 1. Validate image before creating the post
        this.validateImage(file);

        // 2. Create the post in the database
        const post = await this.prisma.client.orm.public.Post.create({
            userId,
            postType: 'IMAGE',
            postKind: 'GENERAL',
            caption: caption?.trim() || null,
            visibility: 'PUBLIC',
            status: 'PUBLISHED',
            publishedAt: Temporal.Now.instant(),
        });

        // 3. Convert the custom runtime's ID to a number
        const postId = Number(post.id);

        if (!Number.isInteger(postId) || postId <= 0) {
            throw new InternalServerErrorException(
                'Invalid post ID returned from database',
            );
        }

        let mediaUrl: string | undefined;

        try {
            // 4. Upload image to Cloudinary
            mediaUrl = await this.uploadImageToCloudinary(
                file.buffer,
                postId,
            );

            // 5. Save image URL in PostMedia table
            const media = await this.savePostMedia(
                postId,
                mediaUrl,
            );

            // 6. Return post and media details
            return {
                success: true,
                message: 'Post created successfully with image',
                post,
                media,
            };
        } catch (error) {
            console.error(
                'Create post with image failed:',
                error,
            );

            // 7. If media save fails, remove uploaded image
            if (mediaUrl) {
                try {
                    const uploadResult =
                        await this.cloudinaryClient.uploader.upload(
                            mediaUrl,
                            {
                                resource_type: 'image',
                            },
                        );

                    // No cleanup action is performed here because
                    // a URL is not a reliable way to reconstruct
                    // the original Cloudinary public ID.
                    void uploadResult;
                } catch (cleanupError) {
                    console.error(
                        'Cloudinary cleanup failed:',
                        cleanupError,
                    );
                }
            }

            throw new InternalServerErrorException(
                'Post was created, but image upload or media saving failed',
            );
        }
    }

    // =====================================
    // UPLOAD IMAGE TO AN EXISTING POST
    // =====================================

    async uploadPostImage(
        postId: number,
        userId: number,
        file: {
            buffer: Buffer;
            mimetype: string;
            size: number;
        } | undefined,
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
}
