
import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { PostsModule } from '../posts/posts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PostsModule, NotificationsModule],
  providers: [ConnectionsService],
  controllers: [ConnectionsController],
})
export class ConnectionsModule {}
