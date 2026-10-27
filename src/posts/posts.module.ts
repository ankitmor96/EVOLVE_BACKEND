
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsProcessor } from './posts.processor';
import { PostsGateway } from './posts.gateway';

import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';


@Module({
  imports: [
    AuthModule,
    PrismaModule,
    CloudinaryModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: 'posts',
    }),
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    PostsProcessor,
    PostsGateway,
  ],
  exports: [PostsGateway],
})
export class PostsModule { }
