
import {
    Injectable,
    Logger,
} from '@nestjs/common';

import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

import {
    FrameModerationResult,
    AudioModerationResult,
} from './video-moderation.types';

import { VideoFrameBatch } from './video-frame.service';

@Injectable()
export class VideoOpenAIService {
    private readonly logger = new Logger(VideoOpenAIService.name);
    private readonly openai: OpenAI;

    private readonly moderationModel = 'omni-moderation-latest';

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');

        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is missing');
        }

        this.openai = new OpenAI({
            apiKey,
            timeout: 120000,
            maxRetries: 2,
        });
    }

    // ----------------------------------------
    // 1. Moderate extracted video frames
    // ----------------------------------------


    async moderateFrameBatch(
        batch: VideoFrameBatch,
        postId: number,
    ): Promise<FrameModerationResult[]> {
        if (!batch.frames.length) {
            return [];
        }

        try {
            this.logger.log(
                `Moderating ${batch.frames.length} frames in batch ${batch.batchIndex} for post ${postId}`,
            );

            const results: FrameModerationResult[] = [];

            // Process each frame separately
            for (const frame of batch.frames) {
                this.logger.log(
                    `Moderating frame ${frame.index} for post ${postId}`,
                );

                const imageUrl = `data:${frame.mimeType};base64,${frame.data.toString('base64')}`;

                const response = await this.openai.moderations.create({
                    model: this.moderationModel,
                    input: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                            },
                        },
                    ],
                });

                const result = response.results[0];

                if (!result) {
                    throw new Error(
                        `No moderation result for frame ${frame.index} of post ${postId}`,
                    );
                }

                results.push({
                    index: frame.index,
                    timestampSeconds: frame.timestampSeconds,
                    flagged: result.flagged,
                    categories: { ...result.categories },
                    categoryScores: { ...result.category_scores },
                });
            }

            this.logger.log(
                `All ${results.length} frames moderated successfully for post ${postId}`,
            );

            return results;
        } catch (error) {
            this.logger.error(
                `Frame moderation failed for post ${postId}`,
                error instanceof Error ? error.stack : String(error),
            );

            throw error;
        }
    }


    // ----------------------------------------
    // 2. Moderate audio transcript
    // ----------------------------------------

    async moderateTranscript(
        transcript: string,
        postId: number,
    ): Promise<AudioModerationResult> {
        const cleanTranscript = transcript.trim();

        if (!cleanTranscript) {
            return {
                transcript: '',
                flagged: false,
                categories: {},
                categoryScores: {},
            };
        }

        try {
            this.logger.log(
                `Moderating audio transcript for post ${postId}`,
            );

            const response = await this.openai.moderations.create({
                model: this.moderationModel,
                input: cleanTranscript,
            });

            const result = response.results[0];

            if (!result) {
                throw new Error(
                    `No audio moderation result received for post ${postId}`,
                );
            }

            const moderationResult: AudioModerationResult = {
                transcript: cleanTranscript,
                flagged: result.flagged,
                categories: { ...result.categories },
                categoryScores: { ...result.category_scores },
            };

            this.logger.log(
                `Audio transcript moderated successfully for post ${postId}`,
            );

            return moderationResult;
        } catch (error) {
            this.logger.error(
                `Audio moderation failed for post ${postId}`,
                error instanceof Error ? error.stack : String(error),
            );

            throw error;
        }
    }
}
