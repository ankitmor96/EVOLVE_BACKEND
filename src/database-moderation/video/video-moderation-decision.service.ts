
import { Injectable, Logger } from '@nestjs/common';

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
export class VideoModerationDecisionService {
  private readonly logger = new Logger(
    VideoModerationDecisionService.name,
  );

  evaluateVideo(input: {
    postId: number;
    frameResults: FrameModerationResult[];
    audioResult: AudioModerationResult | null;
    hasAudio: boolean;
    transcriptionStatus: TranscriptionStatus;
  }): VideoModerationSummary {
    const {
      postId,
      frameResults,
      audioResult,
      hasAudio,
      transcriptionStatus,
    } = input;

    const reasons: string[] = [];

    // 1. Check frame moderation
    if (frameResults.length === 0) {
      reasons.push('No frame moderation results available');
    }

    // 2. Check audio moderation completeness
    if (
      hasAudio &&
      transcriptionStatus === 'AUDIO_EXTRACTION_FAILED'
    ) {
      reasons.push('Audio extraction failed or audio buffer is missing');
    }

    if (
      transcriptionStatus === 'TRANSCRIBED' &&
      !audioResult
    ) {
      reasons.push('Transcript moderation result is missing');
    }

    // 3. Check flagged video frames
    for (const frame of frameResults) {
      if (frame.flagged) {
        const categories = Object.entries(frame.categories)
          .filter(([, flagged]) => flagged === true)
          .map(([category]) => category);

        reasons.push(
          `Frame ${frame.index} flagged: ${
            categories.length
              ? categories.join(', ')
              : 'Harmful content detected'
          }`,
        );
      }
    }

    // 4. Check flagged audio transcript
    if (audioResult?.flagged) {
      const categories = Object.entries(audioResult.categories)
        .filter(([, flagged]) => flagged === true)
        .map(([category]) => category);

      reasons.push(
        `Audio flagged: ${
          categories.length
            ? categories.join(', ')
            : 'Harmful content detected'
        }`,
      );
    }

    // 5. Determine incomplete moderation
    const incompleteModeration =
      frameResults.length === 0 ||
      (
        hasAudio &&
        transcriptionStatus === 'AUDIO_EXTRACTION_FAILED'
      ) ||
      (
        transcriptionStatus === 'TRANSCRIBED' &&
        !audioResult
      );

    // 6. Check harmful content
    const contentFlagged =
      frameResults.some((frame) => frame.flagged) ||
      Boolean(audioResult?.flagged);

    // 7. Final decision
    let finalStatus: 'APPROVED' | 'REJECTED' | 'REVIEW';

    if (contentFlagged) {
      finalStatus = 'REJECTED';
    } else if (incompleteModeration) {
      finalStatus = 'REVIEW';
    } else {
      finalStatus = 'APPROVED';
    }

    // 8. Audio status logs
    this.logger.log(
      `Audio status for post ${postId}: ${transcriptionStatus}`,
    );

    this.logger.log(
      `Video moderation decision for post ${postId}: ${finalStatus}`,
    );

    return {
      postId,
      finalStatus,
      frameResults,
      audioResult,
      reasons,
    };
  }
}
