
import { Module } from '@nestjs/common';

import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';

import { NotificationsModule } from '../notifications/notifications.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [
    NotificationsModule,
    PostsModule,
  ],
  providers: [
    MessagingService,
  ],
  controllers: [
    MessagingController,
  ],
})
export class MessagingModule {}
