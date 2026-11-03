import {
    IsString,
    IsUUID,
} from 'class-validator';

export class EndTrackingDto {
    @IsString()
    @IsUUID()
    sessionId: string;
}