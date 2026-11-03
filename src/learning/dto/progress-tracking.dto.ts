import {
    IsString,
    MinLength,
    MaxLength,
    IsInt,
    Min,
    Max,
    IsNumber,
    IsBoolean,
} from 'class-validator';


export class ProgressTrackingDto {
    @IsString()
    @MinLength(10)
    @MaxLength(100)
    sessionId: string;

    @IsString()
    @MinLength(10)
    @MaxLength(100)
    progressId: string;

    @IsInt()
    @Min(0)
    @Max(10)
    activeSeconds: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    completionPercentage: number;

    @IsBoolean()
    isActive: boolean;
}