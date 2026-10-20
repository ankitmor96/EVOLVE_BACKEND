
import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma/prisma.service';

import { PostsGateway } from '../posts/posts.gateway';

@Injectable()
export class CommentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postsGateway: PostsGateway,
    ) { }

    // Validate IDs
    private validateId(id: number, fieldName: string): void {
        if (!Number.isInteger(id) || id <= 0) {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }
    }

    // 1. CREATE COMMENT
    async createComment(
        postId: number,
        userId: number,
        content: string,
    ) {
        this.validateId(postId, 'post ID');
        this.validateId(userId, 'user ID');

        const trimmedContent = content?.trim();

        if (!trimmedContent) {
            throw new BadRequestException('Comment content is required');
        }

        const post = await this.prisma.client.orm.public.Post
            .where({
                id: postId,
                deletedAt: null,
            })
            .first();

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        const comment = await this.prisma.client.orm.public.Comment.create({
            postId,
            userId,
            content: trimmedContent,
        });

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId })
            .where((item) => item.deletedAt.isNull())
            .all();

        this.postsGateway.emitCommentUpdate({
            type: 'COMMENT_CREATED',
            postId,
            comment,
            commentCount: comments.length,
        });

        return {
            success: true,
            message: 'Comment created successfully',
            data: comment,
        };
    }

    // 2. GET ALL COMMENTS FOR A POST
    async getPostComments(postId: number) {
        this.validateId(postId, 'post ID');

        const post = await this.prisma.client.orm.public.Post
            .where({
                id: postId,
                deletedAt: null,
            })
            .first();

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId })
            .where((comment) => comment.deletedAt.isNull())
            .orderBy([
                (comment) => comment.createdAt.desc(),
                (comment) => comment.id.desc(),
            ])
            .all();

        return {
            success: true,
            count: comments.length,
            data: comments,
        };
    }

    // 3. GET LOGGED-IN USER'S COMMENTS
    async getMyComments(userId: number) {
        this.validateId(userId, 'user ID');

        const comments = await this.prisma.client.orm.public.Comment
            .where({ userId })
            .where((comment) => comment.deletedAt.isNull())
            .orderBy([
                (comment) => comment.createdAt.desc(),
                (comment) => comment.id.desc(),
            ])
            .all();

        return {
            success: true,
            count: comments.length,
            data: comments,
        };
    }


    // 4. UPDATE OWN COMMENT
    async updateComment(
        commentId: number,
        userId: number,
        content: string,
    ) {
        this.validateId(commentId, 'comment ID');
        this.validateId(userId, 'user ID');

        const trimmedContent = content?.trim();

        if (!trimmedContent) {
            throw new BadRequestException('Comment content is required');
        }

        const existingComment =
            await this.prisma.client.orm.public.Comment
                .where({
                    id: commentId,
                    userId,
                    deletedAt: null,
                })
                .first();

        if (!existingComment) {
            throw new NotFoundException(
                'Comment not found or you do not have permission to edit it',
            );
        }

        const updatedComment =
            await this.prisma.client.orm.public.Comment
                .where({
                    id: commentId,
                    userId,
                    deletedAt: null,
                })
                .update({
                    content: trimmedContent,
                    updatedAt: Temporal.Now.instant(),
                });

        const comments =
            await this.prisma.client.orm.public.Comment
                .where({ postId: existingComment.postId })
                .where((item) => item.deletedAt.isNull())
                .all();

        this.postsGateway.emitCommentUpdate({
            type: 'COMMENT_UPDATED',
            postId: existingComment.postId,
            comment: updatedComment,
            commentCount: comments.length,
        });

        return {
            success: true,
            message: 'Comment updated successfully',
            data: updatedComment,
        };
    }



    // 5. SOFT DELETE OWN COMMENT
    async deleteComment(commentId: number, userId: number) {
        this.validateId(commentId, 'comment ID');
        this.validateId(userId, 'user ID');

        const existingComment =
            await this.prisma.client.orm.public.Comment
                .where({
                    id: commentId,
                    userId,
                    deletedAt: null,
                })
                .first();

        if (!existingComment) {
            throw new NotFoundException(
                'Comment not found or you do not have permission to delete it',
            );
        }

        await this.prisma.client.orm.public.Comment
            .where({
                id: commentId,
                userId,
                deletedAt: null,
            })
            .update({
                deletedAt: Temporal.Now.instant(),
                updatedAt: Temporal.Now.instant(),
            });

        // Delete pachi active comments no latest count melavo.
        const comments =
            await this.prisma.client.orm.public.Comment
                .where({ postId: existingComment.postId })
                .where((item) => item.deletedAt.isNull())
                .all();

        // Real-time comment delete ane updated count emit karo.
        this.postsGateway.emitCommentUpdate({
            type: 'COMMENT_DELETED',
            postId: existingComment.postId,
            commentId,
            userId,
            commentCount: comments.length,
        });

        return {
            success: true,
            message: 'Comment deleted successfully',
            commentCount: comments.length,
        };
    }


    // 6. GET ACTIVE COMMENT COUNT FOR A POST
    async getCommentCount(postId: number) {
        this.validateId(postId, 'post ID');

        const post = await this.prisma.client.orm.public.Post
            .where({
                id: postId,
                deletedAt: null,
            })
            .first();

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId })
            .where((comment) => comment.deletedAt.isNull())
            .all();

        return {
            success: true,
            postId,
            count: comments.length,
        };
    }
}
