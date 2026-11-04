import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { DatabaseModerationService } from './database-moderation.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
  ],
  providers: [DatabaseModerationService],
  exports: [DatabaseModerationService],
})
export class DatabaseModerationModule {}