import {
    Body,
    Controller,
    Get,
    Patch,
    Delete,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';

import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateProfileBioDto } from './dto/update-profile-bio.dto';

import {
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
    BadRequestException,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

@Controller('profile')
export class ProfileController {
    constructor(
        private readonly profileService: ProfileService,
    ) { }

    // =====================================
    // CREATE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post()
    async createProfile(
        @Req() req: any,
        @Body() dto: CreateProfileDto,
    ) {
        const userId = req.user.userId;

        return this.profileService.createProfile(
            userId,
            dto,
        );
    }

    // =====================================
    // UPLOAD AVATAR
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('avatar')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async uploadAvatar(
        @Req() req: any,
        @UploadedFile() file: {
            buffer: Buffer;
            mimetype: string;
            size: number;
        },
    ) {
        if (!file) {
            throw new BadRequestException(
                'Please select an image to upload',
            );
        }

        const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Only JPG, PNG and WEBP images are allowed',
            );
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new BadRequestException(
                'Image size must not exceed 5 MB',
            );
        }

        const userId = req.user.userId;

        return this.profileService.uploadAvatar(
            userId,
            file,
        );
    }

    // =====================================
    // GET PROFILE + IDENTITIES
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get()
    async getProfile(
        @Req() req: any,
    ) {
        const userId = req.user.userId;

        return this.profileService.getProfile(userId);
    }

    // =====================================
    // GET COMPLETE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('complete')
    async getCompleteProfile(
        @Req() req: any,
    ) {
        const userId = req.user.userId;

        return this.profileService.getCompleteProfile(
            userId,
        );
    }

    // =====================================
    // UPDATE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Patch()
    async updateProfile(
        @Req() req: any,
        @Body() dto: UpdateProfileDto,
    ) {
        const userId = req.user.userId;

        return this.profileService.updateProfile(
            userId,
            dto,
        );
    }

    // =====================================
    // DELETE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Delete()
    async deleteProfile(
        @Req() req: any,
    ) {
        const userId = req.user.userId;

        return this.profileService.deleteProfile(
            userId,
        );
    }

    // =====================================
    // ADD BIO
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('bio')
    async addBio(
        @Req() req: any,
        @Body() dto: UpdateProfileBioDto,
    ) {
        const userId = req.user.userId;

        return this.profileService.updateBio(
            userId,
            dto.bio,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Get('bio')
    async getBio(@Req() req: any) {
        const userId = req.user.userId;

        return this.profileService.getBio(userId);
    }

    // =====================================
    // UPDATE BIO
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Patch('bio')
    async updateBio(
        @Req() req: any,
        @Body() dto: UpdateProfileBioDto,
    ) {
        const userId = req.user.userId;

        return this.profileService.updateBio(
            userId,
            dto.bio,
        );
    }
}