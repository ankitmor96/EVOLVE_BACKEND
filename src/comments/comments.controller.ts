
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Req,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class CommentsController {
    constructor(private readonly commentsService: CommentsService) { }

    // 1. Create comment
    @Post('posts/:postId/comments')
    createComment(
        @Param('postId', ParseIntPipe) postId: number,
        @Body('content') content: string,
        @Req() req: any,
    ) {
        return this.commentsService.createComment(
            postId,
            Number(req.user.userId),
            content,
        );
    }

    // 2. Get comments for a post
    @Get('posts/:postId/comments')
    getPostComments(
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.commentsService.getPostComments(postId);
    }

    // 3. Get logged-in user's comments
    @Get('comments/my-comments')
    getMyComments(@Req() req: any) {
        return this.commentsService.getMyComments(
            Number(req.user.userId),
        );
    }

    // 4. Update own comment
    @Patch('comments/:commentId')
    updateComment(
        @Param('commentId', ParseIntPipe) commentId: number,
        @Body('content') content: string,
        @Req() req: any,
    ) {
        return this.commentsService.updateComment(
            commentId,
            Number(req.user.userId),
            content,
        );
    }

    // 5. Soft-delete own comment
    @Delete('comments/:commentId')
    deleteComment(
        @Param('commentId', ParseIntPipe) commentId: number,
        @Req() req: any,
    ) {
        return this.commentsService.deleteComment(
            commentId,
            Number(req.user.userId),
        );
    }

    // 6. Get comment count for a post
    @Get('posts/:postId/comments/count')
    getCommentCount(
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.commentsService.getCommentCount(postId);
    }
}
