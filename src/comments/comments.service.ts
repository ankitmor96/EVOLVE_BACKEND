
import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma/prisma.service';
import { PostsGateway } from '../posts/posts.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postsGateway: PostsGateway,
        private readonly notificationsService: NotificationsService,
    ) { }

    private validateId(id: number, fieldName: string): void {
        if (!Number.isInteger(id) || id <= 0) {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }
    }

    // Create comment
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
            .where({ id: postId, deletedAt: null })
            .first();

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        const comment = await this.prisma.client.orm.public.Comment.create({
            postId,
            userId,
            content: trimmedContent,
        });

        // Notify the post owner, but not when they comment on their own post
        if (Number(post.userId) !== userId) {
            await this.notificationsService.createCommentNotification(
                Number(post.userId),
                userId,
                postId,
            );
        }

        const profile = await this.prisma.client.orm.public.UserProfile
            .where({ userId })
            .first();

        const commentWithUser = {
            ...comment,
            user: {
                username: profile?.username ?? null,
                avatarUrl: profile?.avatarUrl ?? null,
            },
        };

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId })
            .where((item) => item.deletedAt.isNull())
            .all();

        this.postsGateway.emitCommentUpdate({
            type: 'COMMENT_CREATED',
            postId,
            comment: commentWithUser,
            commentCount: comments.length,
        });

        return {
            success: true,
            message: 'Comment created successfully',
            data: commentWithUser,
        };
    }

    // Get all comments for a post with commenter details
    async getPostComments(postId: number) {
        this.validateId(postId, 'post ID');

        const post = await this.prisma.client.orm.public.Post
            .where({ id: postId, deletedAt: null })
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

        const userIds = [
            ...new Set(comments.map((comment) => comment.userId)),
        ];

        const userProfiles = userIds.length > 0
            ? await this.prisma.client.orm.public.UserProfile
                .where((profile) => profile.userId.in(userIds))
                .all()
            : [];

        const commentsWithUser = comments.map((comment) => {
            const profile = userProfiles.find(
                (item) => item.userId === comment.userId,
            );

            return {
                ...comment,
                user: {
                    username: profile?.username ?? null,
                    avatarUrl: profile?.avatarUrl ?? null,
                },
            };
        });

        return {
            success: true,
            count: commentsWithUser.length,
            data: commentsWithUser,
        };
    }

    // Get current user's comments with profile details
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

        const profile = await this.prisma.client.orm.public.UserProfile
            .where({ userId })
            .first();

        const commentsWithUser = comments.map((comment) => ({
            ...comment,
            user: {
                username: profile?.username ?? null,
                avatarUrl: profile?.avatarUrl ?? null,
            },
        }));

        return {
            success: true,
            count: commentsWithUser.length,
            data: commentsWithUser,
        };
    }

    // Update comment with commenter details
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

        const existingComment = await this.prisma.client.orm.public.Comment
            .where({ id: commentId, userId, deletedAt: null })
            .first();

        if (!existingComment) {
            throw new NotFoundException(
                'Comment not found or you do not have permission to edit it',
            );
        }

        const updatedComment = await this.prisma.client.orm.public.Comment
            .where({ id: commentId, userId, deletedAt: null })
            .update({
                content: trimmedContent,
                updatedAt: Temporal.Now.instant(),
            });

        const profile = await this.prisma.client.orm.public.UserProfile
            .where({ userId })
            .first();

        const updatedCommentWithUser = {
            ...updatedComment,
            user: {
                username: profile?.username ?? null,
                avatarUrl: profile?.avatarUrl ?? null,
            },
        };

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId: existingComment.postId })
            .where((item) => item.deletedAt.isNull())
            .all();

        this.postsGateway.emitCommentUpdate({
            type: 'COMMENT_UPDATED',
            postId: existingComment.postId,
            comment: updatedCommentWithUser,
            commentCount: comments.length,
        });

        return {
            success: true,
            message: 'Comment updated successfully',
            data: updatedCommentWithUser,
        };
    }

    // Soft delete comment
    async deleteComment(commentId: number, userId: number) {
        this.validateId(commentId, 'comment ID');
        this.validateId(userId, 'user ID');

        const existingComment = await this.prisma.client.orm.public.Comment
            .where({ id: commentId, userId, deletedAt: null })
            .first();

        if (!existingComment) {
            throw new NotFoundException(
                'Comment not found or you do not have permission to delete it',
            );
        }

        const now = Temporal.Now.instant();

        await this.prisma.client.orm.public.Comment
            .where({ id: commentId, userId, deletedAt: null })
            .update({
                deletedAt: now,
                updatedAt: now,
            });

        const comments = await this.prisma.client.orm.public.Comment
            .where({ postId: existingComment.postId })
            .where((item) => item.deletedAt.isNull())
            .all();

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

    // Get active comment count for a post
    async getCommentCount(postId: number) {
        this.validateId(postId, 'post ID');

        const post = await this.prisma.client.orm.public.Post
            .where({ id: postId, deletedAt: null })
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
