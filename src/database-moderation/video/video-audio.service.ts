
import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';

import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VideoAudioService {
    private readonly logger = new Logger(
        VideoAudioService.name,
    );

    private readonly openai: OpenAI;

    private readonly maxAudioSize = 24 * 1024 * 1024;

    constructor(
        private readonly configService: ConfigService,
    ) {
        const apiKey = this.configService.get<string>(
            'OPENAI_API_KEY',
        );

        if (!apiKey) {
            throw new Error(
                'OPENAI_API_KEY is missing',
            );
        }

        this.openai = new OpenAI({
            apiKey,
            timeout: 120000,
            maxRetries: 2,
        });
    }

    // ==========================================
    // TRANSCRIBE VIDEO AUDIO
    // ==========================================

    async transcribeAudio(
        audioBuffer: Buffer,
        postId: number,
    ): Promise<string> {
        if (
            !Buffer.isBuffer(audioBuffer) ||
            audioBuffer.length === 0
        ) {
            throw new BadRequestException(
                'Audio buffer is empty',
            );
        }

        if (audioBuffer.length > this.maxAudioSize) {
            throw new BadRequestException(
                'Audio file exceeds the 24 MB transcription limit',
            );
        }

        try {
            this.logger.log(
                `Starting audio transcription for post ${postId}`,
            );

            const audioFile = new File(
                [new Uint8Array(audioBuffer)],
                `video-${postId}.mp3`,
                {
                    type: 'audio/mpeg',
                },
            );

            const response =
                await this.openai.audio.transcriptions.create({
                    file: audioFile,
                    model: 'gpt-4o-mini-transcribe',
                });

            const transcript = response.text?.trim() ?? '';

            this.logger.log(
                `Transcript length for post ${postId}: ${transcript.length}`,
            );

            this.logger.log(
                `Audio transcription completed for post ${postId}`,
            );

            return transcript;
        } catch (error) {
            this.logger.error(
                `Audio transcription failed for post ${postId}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );

            throw error;
        }
    }
}
