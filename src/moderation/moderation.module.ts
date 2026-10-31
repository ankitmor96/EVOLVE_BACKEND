import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}