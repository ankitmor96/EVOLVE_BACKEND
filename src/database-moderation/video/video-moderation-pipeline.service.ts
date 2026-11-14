
import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { VideoModerationService } from './video-moderation.service';
import { VideoFrameService } from './video-frame.service';
import { VideoAudioService } from './video-audio.service';
import { VideoOpenAIService } from './video-openai.service';
import { VideoModerationDecisionService } from './video-moderation-decision.service';

import {
  FrameModerationResult,
  VideoModerationSummary,
} from './video-moderation.types';

@Injectable()
export class VideoModerationPipelineService {
  private readonly logger = new Logger(
    VideoModerationPipelineService.name,
  );

  constructor(
    private readonly videoModerationService: VideoModerationService,
    private readonly videoFrameService: VideoFrameService,
    private readonly videoAudioService: VideoAudioService,
    private readonly videoOpenAIService: VideoOpenAIService,
    private readonly decisionService: VideoModerationDecisionService,
  ) {}

  async processVideo(
    postId: number,
    userId: number,
    videoUrl: string,
  ): Promise<VideoModerationSummary> {
    this.logger.log(`Starting video moderation for post ${postId}`);

    // 1. Extract frames and audio from Cloudinary video
    const extraction =
      await this.videoModerationService.extractVideoAssets(
        videoUrl,
        postId,
      );

    this.logger.log(
      `Extracted ${extraction.frames.length} frames for post ${postId}`,
    );

    // 2. Prepare frame batches
    const frameBatches =
      this.videoFrameService.prepareFrameBatches(
        extraction.frames,
      );

    // 3. Moderate frame batches using OpenAI
    const frameResults: FrameModerationResult[] = [];

    for (const batch of frameBatches) {
      const results =
        await this.videoOpenAIService.moderateFrameBatch(
          batch,
          postId,
        );

      frameResults.push(...results);
    }

    // 4. Transcribe audio
    let transcript = '';

    if (extraction.audioBuffer && extraction.hasAudio) {
      transcript = await this.videoAudioService.transcribeAudio(
        extraction.audioBuffer,
        postId,
      );
    }

    // 5. Moderate audio transcript using OpenAI
    let audioResult = null;

    if (extraction.hasAudio && transcript.trim()) {
      audioResult =
        await this.videoOpenAIService.moderateTranscript(
          transcript,
          postId,
        );
    }

    // 6. Generate final moderation decision
    const summary = this.decisionService.evaluateVideo({
      postId,
      frameResults,
      audioResult,
      hasAudio: extraction.hasAudio,
    });

    this.logger.log(
      `Video moderation completed for post ${postId}: ${summary.finalStatus}`,
    );

    return summary;
  }
}
