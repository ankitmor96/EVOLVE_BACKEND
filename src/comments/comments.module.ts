

import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsModule } from '../posts/posts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, PostsModule, NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule { }

