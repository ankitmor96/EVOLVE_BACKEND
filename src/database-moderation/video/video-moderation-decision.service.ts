
import { Injectable, Logger } from '@nestjs/common';

import {
  FrameModerationResult,
  AudioModerationResult,
  VideoModerationSummary,
} from './video-moderation.types';

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
  }): VideoModerationSummary {
    const {
      postId,
      frameResults,
      audioResult,
      hasAudio,
    } = input;

    const reasons: string[] = [];

    // 1. Check whether frame moderation is complete
    if (frameResults.length === 0) {
      reasons.push('No frame moderation results available');
    }

    // 2. Check whether audio moderation is complete
    if (hasAudio && (!audioResult || !audioResult.transcript.trim())) {
      reasons.push('Audio moderation result is missing or transcript is empty');
    }

    // 3. Check flagged video frames
    for (const frame of frameResults) {
      if (frame.flagged) {
        const categories = Object.entries(frame.categories)
          .filter(([, flagged]) => flagged === true)
          .map(([category]) => category);

        reasons.push(
          `Frame ${frame.index} flagged: ${
            categories.length ? categories.join(', ') : 'Harmful content detected'
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
          categories.length ? categories.join(', ') : 'Harmful content detected'
        }`,
      );
    }

    // 5. Final moderation decision
    let finalStatus: 'APPROVED' | 'REJECTED' | 'REVIEW';

    const incompleteModeration =
      frameResults.length === 0 ||
      (hasAudio && (!audioResult || !audioResult.transcript.trim()));

    const contentFlagged =
      frameResults.some((frame) => frame.flagged) ||
      Boolean(audioResult?.flagged);

    if (contentFlagged) {
      finalStatus = 'REJECTED';
    } else if (incompleteModeration) {
      finalStatus = 'REVIEW';
    } else {
      finalStatus = 'APPROVED';
    }

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
