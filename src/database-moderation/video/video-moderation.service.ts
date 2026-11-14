
import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import ffmpeg = require('fluent-ffmpeg');

import { Readable } from 'stream';

import {
    VideoExtractionResult,
    ExtractedVideoFrame,
} from './video-moderation.types';

interface VideoMetadata {
    format?: {
        duration?: number | string;
    };
    streams?: Array<{
        codec_type?: string;
    }>;
}

@Injectable()
export class VideoModerationService {
    private readonly logger = new Logger(
        VideoModerationService.name,
    );

    private readonly frameIntervalSeconds = 5;

    private readonly maxFrameOutputBytes = 20 * 1024 * 1024;

    private readonly maxAudioOutputBytes = 24 * 1024 * 1024;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.logger.log(
            'Video Moderation Service initialized',
        );
    }

    // ==========================================
    // CONFIGURATION
    // ==========================================

    private getMaxVideoDuration(): number {
        const value = Number(
            this.configService.get(
                'VIDEO_MAX_DURATION_SECONDS',
                600,
            ),
        );

        return Number.isFinite(value) && value > 0
            ? value
            : 600;
    }

    // ==========================================
    // VALIDATE CLOUDINARY VIDEO URL
    // ==========================================

    private validateVideoUrl(videoUrl: string): void {
        let parsedUrl: URL;

        try {
            parsedUrl = new URL(videoUrl);
        } catch {
            throw new BadRequestException(
                'Invalid video URL',
            );
        }

        if (parsedUrl.protocol !== 'https:') {
            throw new BadRequestException(
                'Video URL must use HTTPS',
            );
        }

        const hostname = parsedUrl.hostname.toLowerCase();

        if (
            hostname !== 'res.cloudinary.com' &&
            !hostname.endsWith('.cloudinary.com')
        ) {
            throw new BadRequestException(
                'Only Cloudinary video URLs are allowed',
            );
        }
    }

    // ==========================================
    // GET VIDEO METADATA
    // ==========================================

    private async getVideoMetadata(
        videoUrl: string,
    ): Promise<VideoMetadata> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(
                videoUrl,
                (error, metadata) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(metadata as VideoMetadata);
                },
            );
        });
    }

    // ==========================================
    // RUN FFMPEG AND COLLECT MEMORY BUFFER
    // ==========================================

    private async extractToBuffer(
        videoUrl: string,
        outputFormat: 'image2pipe' | 'mp3',
        outputOptions: string[],
        maxOutputBytes: number,
    ): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg(videoUrl)
                .outputOptions(outputOptions)
                .format(outputFormat);

            const output = command.pipe() as Readable;

            const chunks: Buffer[] = [];

            let totalBytes = 0;
            let settled = false;

            const fail = (error: Error) => {
                if (settled) {
                    return;
                }

                settled = true;

                command.kill('SIGKILL');

                reject(error);
            };

            output.on('data', (chunk: Buffer | string) => {
                if (settled) {
                    return;
                }

                const buffer = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk);

                totalBytes += buffer.length;

                if (totalBytes > maxOutputBytes) {
                    fail(
                        new Error(
                            `FFmpeg output exceeded the allowed limit of ${maxOutputBytes} bytes`,
                        ),
                    );

                    return;
                }

                chunks.push(buffer);
            });

            output.on('end', () => {
                if (settled) {
                    return;
                }

                settled = true;

                resolve(Buffer.concat(chunks));
            });

            output.on('error', (error: Error) => {
                fail(error);
            });

            command.on('error', (error: Error) => {
                fail(error);
            });
        });
    }

    // ==========================================
    // SPLIT JPEG FRAMES FROM MJPEG BUFFER
    // ==========================================

    private splitJpegFrames(
        data: Buffer,
        durationSeconds: number,
    ): ExtractedVideoFrame[] {
        const frames: ExtractedVideoFrame[] = [];

        const jpegStart = Buffer.from([0xff, 0xd8]);
        const jpegEnd = Buffer.from([0xff, 0xd9]);

        let offset = 0;

        while (offset < data.length) {
            const start = data.indexOf(jpegStart, offset);

            if (start === -1) {
                break;
            }

            const end = data.indexOf(
                jpegEnd,
                start + 2,
            );

            if (end === -1) {
                break;
            }

            const frameBuffer = data.subarray(
                start,
                end + 2,
            );

            const index = frames.length;

            const timestampSeconds =
                index * this.frameIntervalSeconds;

            if (timestampSeconds <= durationSeconds) {
                frames.push({
                    index,
                    timestampSeconds,
                    mimeType: 'image/jpeg',
                    data: Buffer.from(frameBuffer),
                });
            }

            offset = end + 2;
        }

        return frames;
    }

    // ==========================================
    // EXTRACT VIDEO FRAMES AND AUDIO
    // ==========================================

    async extractVideoAssets(
        videoUrl: string,
        postId: number,
    ): Promise<VideoExtractionResult> {
        try {
            this.validateVideoUrl(videoUrl);

            this.logger.log(
                `Starting video extraction for post ${postId}`,
            );

            // 1. Read video metadata from Cloudinary.
            const metadata =
                await this.getVideoMetadata(videoUrl);

            const durationSeconds = Number(
                metadata.format?.duration,
            );

            if (
                !Number.isFinite(durationSeconds) ||
                durationSeconds <= 0
            ) {
                throw new BadRequestException(
                    'Invalid video duration',
                );
            }

            // 2. Validate video duration.
            const maxDuration = this.getMaxVideoDuration();

            if (durationSeconds > maxDuration) {
                throw new BadRequestException(
                    `Video duration exceeds the maximum allowed ${maxDuration} seconds`,
                );
            }

            // 3. Check whether the video contains audio.
            const hasAudio =
                metadata.streams?.some(
                    (stream) =>
                        stream.codec_type === 'audio',
                ) ?? false;

            // 4. Extract sampled JPEG frames directly into memory.
            const frameBuffer = await this.extractToBuffer(
                videoUrl,
                'image2pipe',
                [
                    '-vf',
                    'fps=1/5,scale=1280:-2:force_original_aspect_ratio=decrease',
                    '-q:v',
                    '5',
                ],
                this.maxFrameOutputBytes,
            );

            const frames = this.splitJpegFrames(
                frameBuffer,
                durationSeconds,
            );

            if (frames.length === 0) {
                throw new Error(
                    'FFmpeg did not extract any video frames',
                );
            }

            // 5. Extract audio directly into memory.
            let audioBuffer: Buffer | null = null;

            if (hasAudio) {
                audioBuffer = await this.extractToBuffer(
                    videoUrl,
                    'mp3',
                    [
                        '-vn',
                        '-acodec',
                        'libmp3lame',
                        '-b:a',
                        '64k',
                        '-ac',
                        '1',
                    ],
                    this.maxAudioOutputBytes,
                );

                if (audioBuffer.length === 0) {
                    throw new Error(
                        'FFmpeg extracted an empty audio buffer',
                    );
                }

                this.logger.log(
                    `Extracted audio buffer size for post ${postId}: ${audioBuffer.length} bytes`,
                );
            }

            // 6. Return extracted assets.
            const result: VideoExtractionResult = {
                postId,
                durationSeconds,
                frames,
                audioBuffer,
                audioMimeType: audioBuffer
                    ? 'audio/mpeg'
                    : null,
                hasAudio,
            };

            this.logger.log(
                `Video extraction completed for post ${postId}`,
            );

            this.logger.log(
                `Duration: ${durationSeconds}s | Frames: ${frames.length} | Audio: ${hasAudio}`,
            );

            return result;
        } catch (error) {
            this.logger.error(
                `Video extraction failed for post ${postId}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );

            throw error;
        }
    }
}
