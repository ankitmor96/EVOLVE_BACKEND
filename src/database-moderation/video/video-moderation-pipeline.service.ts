
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
  AudioModerationResult,
  VideoModerationSummary,
} from './video-moderation.types';

type TranscriptionStatus =
  | 'NO_AUDIO'
  | 'NO_SPEECH'
  | 'TRANSCRIBED'
  | 'AUDIO_EXTRACTION_FAILED';

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
    this.logger.log(
      `Starting video moderation for post ${postId}`,
    );

    // 1. Extract video frames and audio
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

    // 3. Moderate video frames
    const frameResults: FrameModerationResult[] = [];

    for (const batch of frameBatches) {
      const results =
        await this.videoOpenAIService.moderateFrameBatch(
          batch,
          postId,
        );

      frameResults.push(...results);
    }

    // 4. Initialize audio status
    let transcript = '';

    let transcriptionStatus: TranscriptionStatus =
      extraction.hasAudio
        ? 'AUDIO_EXTRACTION_FAILED'
        : 'NO_AUDIO';

    // 5. Transcribe audio when audio stream exists
    if (extraction.hasAudio) {
      if (
        extraction.audioBuffer &&
        extraction.audioBuffer.length > 0
      ) {
        const transcriptionResult =
          await this.videoAudioService.transcribeAudio(
            extraction.audioBuffer,
            postId,
          );

        transcriptionStatus = transcriptionResult.status;

        if (transcriptionResult.status === 'TRANSCRIBED') {
          transcript = transcriptionResult.transcript;

          this.logger.log(
            `Speech transcript received for post ${postId}`,
          );
        } else {
          transcript = '';

          this.logger.log(
            `No transcript received for post ${postId}. Audio moderation will be skipped.`,
          );
        }
      } else {
        this.logger.error(
          `Audio stream exists but audio buffer is missing for post ${postId}`,
        );
      }
    }

    // 6. Moderate transcript only when speech transcript exists
    let audioResult: AudioModerationResult | null = null;

    if (
      transcriptionStatus === 'TRANSCRIBED' &&
      transcript.trim()
    ) {
      audioResult =
        await this.videoOpenAIService.moderateTranscript(
          transcript,
          postId,
        );
    }

    // 7. Generate final moderation decision
    const summary = this.decisionService.evaluateVideo({
      postId,
      frameResults,
      audioResult,
      hasAudio: extraction.hasAudio,
      transcriptionStatus,
    });

    this.logger.log(
      `Video moderation completed for post ${postId}: ${summary.finalStatus}`,
    );

    return summary;
  }
}
