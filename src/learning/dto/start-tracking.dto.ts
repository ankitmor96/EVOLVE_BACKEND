import { IsInt, Min } from 'class-validator';

export class StartTrackingDto {
    @IsInt()
    @Min(1)
    postId: number;
}