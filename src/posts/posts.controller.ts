import {
    Controller,
    Post,
    Get,
    Query,
    Param,
    ParseIntPipe,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    Req,
    Body,
    UnauthorizedException,
    BadRequestException,
} from '@nestjs/common';

import { Put } from '@nestjs/common';
import { Delete } from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PostsService } from './posts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('posts')
export class PostsController {
    constructor(
        private readonly postsService: PostsService,
    ) { }

    // =====================================
    // PARSE SKILL IDS
    // =====================================

    private parseSkillIds(skillIds?: string): number[] {
        if (!skillIds || skillIds.trim() === '') {
            return [];
        }

        let parsedSkillIds: unknown;

        try {
            parsedSkillIds = JSON.parse(skillIds);
        } catch {
            throw new BadRequestException(
                'skillIds must be a valid JSON array',
            );
        }

        if (
            !Array.isArray(parsedSkillIds) ||
            !parsedSkillIds.every(
                (id) =>
                    Number.isInteger(Number(id)) &&
                    Number(id) > 0,
            )
        ) {
            throw new BadRequestException(
                'skillIds must contain positive integer IDs',
            );
        }

        return [...new Set(parsedSkillIds.map(Number))];
    }

    // =====================================
    // CREATE POST WITH IMAGE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post()
    @UseInterceptors(
        FileInterceptor('image', {
            storage: memoryStorage(),
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async createPost(
        @Body('caption') caption: string,
        @Body('skillIds') skillIds: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedException(
                'Authenticated user not found',
            );
        }

        return this.postsService.createPostWithImage(
            Number(userId),
            caption,
            file,
            this.parseSkillIds(skillIds),
        );
    }

    // =====================================
    // CREATE POST WITH VIDEO
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('video')
    @UseInterceptors(
        FileInterceptor('video', {
            storage: memoryStorage(),
            limits: {
                fileSize: 50 * 1024 * 1024,
            },
        }),
    )
    async createPostWithVideo(
        @Body('caption') caption: string,
        @Body('skillIds') skillIds: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedException(
                'Authenticated user not found',
            );
        }

        return this.postsService.createPostWithVideo(
            Number(userId),
            caption,
            file,
            this.parseSkillIds(skillIds),
        );
    }

    // =====================================
    // UPLOAD IMAGE TO EXISTING POST
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post(':postId/images')
    @UseInterceptors(
        FileInterceptor('image', {
            storage: memoryStorage(),
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async uploadPostImage(
        @Param('postId', ParseIntPipe) postId: number,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedException(
                'Authenticated user not found',
            );
        }

        return this.postsService.uploadPostImage(
            postId,
            Number(userId),
            file,
        );
    }

    // =====================================
    // CREATE POST WITH DOCUMENT
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('document')
    @UseInterceptors(
        FileInterceptor('document', {
            storage: memoryStorage(),
            limits: {
                fileSize: 10 * 1024 * 1024,
            },
        }),
    )
    async createPostWithDocument(
        @Body('caption') caption: string,
        @Body('skillIds') skillIds: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;

        if (!userId) {
            throw new UnauthorizedException(
                'Authenticated user not found',
            );
        }

        return this.postsService.createPostWithDocument(
            Number(userId),
            caption,
            file,
            this.parseSkillIds(skillIds),
        );
    }

    // =====================================
    // GET FEED WITH CURSOR PAGINATION
    // =====================================

    @Get('feed')
    @UseGuards(JwtAuthGuard)
    async getFeed(
        @Req() req: any,
        @Query('cursor') cursor?: string,
    ) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        let cursorId: number | undefined;

        if (cursor !== undefined) {
            cursorId = Number(cursor);

            if (!Number.isInteger(cursorId) || cursorId <= 0) {
                throw new BadRequestException(
                    'Cursor must be a positive integer',
                );
            }
        }

        return this.postsService.getFeed(userId, cursorId);
    }

    // =====================================
    // GET MY IMAGE POSTS
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('my-posts/images')
    async getMyImagePosts(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsByMediaType(
            userId,
            'IMAGE',
        );
    }

    // =====================================
    // GET MY VIDEO POSTS
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('my-posts/videos')
    async getMyVideoPosts(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsByMediaType(
            userId,
            'VIDEO',
        );
    }

    // =====================================
    // GET MY DOCUMENT POSTS
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('my-posts/documents')
    async getMyDocumentPosts(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsByMediaType(
            userId,
            'DOCUMENT',
        );
    }

    // =====================================
    // GET MY POST COUNTS
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('my-posts/counts')
    async getMyPostsCounts(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsCounts(userId);
    }

    // =====================================
    // GET MY POST ENGAGEMENT COUNTS
    // =====================================

    @Get('my-posts/engagement-counts')
    @UseGuards(JwtAuthGuard)
    async getMyPostsEngagementCounts(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsEngagementCounts(userId);
    }

    // =====================================
    // GET MY LEARNED COUNT
    // =====================================

    @Get('my-posts/learned-count')
    @UseGuards(JwtAuthGuard)
    async getMyPostsLearnedCount(@Req() req: any) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getMyPostsLearnedCount(userId);
    }

    // =====================================
    // SET POST REACTION
    // =====================================

    @Put(':postId/reactions/:reactionType')
    @UseGuards(JwtAuthGuard)
    async setPostReaction(
        @Param('postId', ParseIntPipe) postId: number,
        @Param('reactionType') reactionType: string,
        @Req() req: any,
    ) {
        if (!['APPRECIATE', 'HELPFUL'].includes(reactionType)) {
            throw new BadRequestException(
                'Invalid reaction type. Allowed: APPRECIATE, HELPFUL',
            );
        }

        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.setPostReaction(
            postId,
            userId,
            reactionType as 'APPRECIATE' | 'HELPFUL',
        );
    }

    // =====================================
    // REMOVE POST REACTION
    // =====================================

    @Delete(':postId/reactions/:reactionType')
    @UseGuards(JwtAuthGuard)
    async removePostReaction(
        @Param('postId', ParseIntPipe) postId: number,
        @Param('reactionType') reactionType: string,
        @Req() req: any,
    ) {
        if (!['APPRECIATE', 'HELPFUL'].includes(reactionType)) {
            throw new BadRequestException(
                'Invalid reaction type. Allowed: APPRECIATE, HELPFUL',
            );
        }

        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.removePostReaction(
            postId,
            userId,
            reactionType as 'APPRECIATE' | 'HELPFUL',
        );
    }

    // =====================================
    // GET POST REACTIONS
    // =====================================

    @Get(':postId/reactions')
    @UseGuards(JwtAuthGuard)
    async getPostReactions(
        @Param('postId', ParseIntPipe) postId: number,
        @Req() req: any,
    ) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.getPostReactions(
            postId,
            userId,
        );
    }

    // =====================================
    // MARK POST AS LEARNED
    // =====================================

    @Put(':postId/learned')
    @UseGuards(JwtAuthGuard)
    async markPostLearned(
        @Param('postId', ParseIntPipe) postId: number,
        @Req() req: any,
    ) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.markPostLearned(
            postId,
            userId,
        );
    }

    // =====================================
    // UNMARK POST AS LEARNED
    // =====================================

    @Delete(':postId/learned')
    @UseGuards(JwtAuthGuard)
    async unmarkPostLearned(
        @Param('postId', ParseIntPipe) postId: number,
        @Req() req: any,
    ) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.unmarkPostLearned(
            postId,
            userId,
        );
    }

    // =====================================
    // DELETE POST
    // =====================================

    @Delete(':postId')
    @UseGuards(JwtAuthGuard)
    async deletePost(
        @Param('postId', ParseIntPipe) postId: number,
        @Req() req: any,
    ) {
        const userId = Number(req.user?.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new UnauthorizedException(
                'Invalid authenticated user',
            );
        }

        return this.postsService.deletePost(
            postId,
            userId,
        );
    }
}