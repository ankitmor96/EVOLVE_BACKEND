
import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [MessagingService, PrismaService],
  controllers: [MessagingController],
})
export class MessagingModule {}
