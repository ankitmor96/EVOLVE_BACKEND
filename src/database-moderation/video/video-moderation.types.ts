
export interface ExtractedVideoFrame {
  index: number;
  timestampSeconds: number;
  mimeType: 'image/jpeg';
  data: Buffer;
}

export interface VideoExtractionResult {
  postId: number;
  durationSeconds: number;
  frames: ExtractedVideoFrame[];
  audioBuffer: Buffer | null;
  audioMimeType: 'audio/mpeg' | null;
  hasAudio: boolean;
}

export interface VideoModerationInput {
  postId: number;
  userId: number;
  videoUrl: string;
}

export interface FrameModerationResult {
  index: number;
  timestampSeconds: number;
  flagged: boolean;
  categories: Record<string, boolean | null>;
  categoryScores: Record<string, number>;
}

export interface AudioModerationResult {
  transcript: string;
  flagged: boolean;
  categories: Record<string, boolean | null>;
  categoryScores: Record<string, number>;
}

export interface VideoModerationSummary {
  postId: number;
  finalStatus: 'APPROVED' | 'REJECTED' | 'REVIEW';
  frameResults: FrameModerationResult[];
  audioResult: AudioModerationResult | null;
  reasons: string[];
}
