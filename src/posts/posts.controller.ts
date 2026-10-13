
import {
    Controller,
    Post,
    Param,
    ParseIntPipe,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    Req,
    Body,
    UnauthorizedException,
} from '@nestjs/common';

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
                fileSize: 10 * 1024 * 1024, // 10 MB
            },
        }),
    )
    async createPostWithDocument(
        @Body('caption') caption: string,
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
        );
    }

}
