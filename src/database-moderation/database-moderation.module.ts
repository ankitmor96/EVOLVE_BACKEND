import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { DatabaseModerationService } from './database-moderation.service';
import { VideoModerationService } from './video/video-moderation.service';
import { VideoFrameService } from './video/video-frame.service';
import { VideoAudioService } from './video/video-audio.service';
import { VideoOpenAIService } from './video/video-openai.service';
import { VideoModerationDecisionService } from './video/video-moderation-decision.service';
import { VideoModerationPipelineService } from './video/video-moderation-pipeline.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
  ],
  providers: [
    DatabaseModerationService,
    VideoModerationService,
    VideoFrameService,
    VideoAudioService,
    VideoOpenAIService,
    VideoModerationDecisionService,
     VideoModerationPipelineService,
  ],

  exports: [
    DatabaseModerationService,
    VideoModerationService,
    VideoFrameService,
    VideoAudioService,
    VideoOpenAIService,
    VideoModerationDecisionService,
     VideoModerationPipelineService,
  ],
})
export class DatabaseModerationModule { }