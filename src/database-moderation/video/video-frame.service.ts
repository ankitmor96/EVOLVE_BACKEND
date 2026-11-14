
import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';

import {
  ExtractedVideoFrame,
} from './video-moderation.types';

export interface VideoFrameBatch {
  batchIndex: number;
  frames: ExtractedVideoFrame[];
}

@Injectable()
export class VideoFrameService {
  private readonly logger = new Logger(
    VideoFrameService.name,
  );

  // Maximum frames in one OpenAI moderation request.
  private readonly batchSize = 5;

  // Maximum image size allowed for one frame.
  private readonly maxFrameSizeBytes = 5 * 1024 * 1024;

  // ==========================================
  // PREPARE FRAME BATCHES
  // ==========================================

  prepareFrameBatches(
    frames: ExtractedVideoFrame[],
  ): VideoFrameBatch[] {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new BadRequestException(
        'No extracted video frames available for moderation',
      );
    }

    const batches: VideoFrameBatch[] = [];

    // Validate every frame.
    for (const frame of frames) {
      if (
        !Buffer.isBuffer(frame.data) ||
        frame.data.length === 0
      ) {
        throw new BadRequestException(
          `Invalid frame buffer at index ${frame.index}`,
        );
      }

      if (frame.data.length > this.maxFrameSizeBytes) {
        throw new BadRequestException(
          `Frame ${frame.index} exceeds the 5 MB limit`,
        );
      }

      if (frame.mimeType !== 'image/jpeg') {
        throw new BadRequestException(
          `Unsupported image format for frame ${frame.index}`,
        );
      }
    }

    // Divide frames into batches.
    for (
      let index = 0;
      index < frames.length;
      index += this.batchSize
    ) {
      const batchFrames = frames.slice(
        index,
        index + this.batchSize,
      );

      batches.push({
        batchIndex: batches.length,
        frames: batchFrames,
      });
    }

    this.logger.log(
      `Prepared ${batches.length} frame batches from ${frames.length} frames`,
    );

    return batches;
  }
}
