
import {
    Body,
    Controller,
    Get,
    Patch,
    Delete,
    Post,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateProfileBioDto } from './dto/update-profile-bio.dto';

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
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async createProfile(
        @Req() req: any,
        @Body() dto: CreateProfileDto,
        @UploadedFile()
        file?: Express.Multer.File,
    ) {
        console.log('Avatar file received:', !!file);
        console.log('Avatar MIME type:', file?.mimetype);
        console.log('Avatar size:', file?.size);
        console.log('Avatar buffer received:', !!file?.buffer);

        if (!file?.buffer) {
            throw new BadRequestException(
                'Avatar image is required. Send it using FormData field "file".',
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

        return this.profileService.createProfile(
            userId,
            dto,
            file,
        );
    }

    // =====================================
    // UPLOAD AVATAR FOR EXISTING PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('avatar')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    async uploadAvatar(
        @Req() req: any,
        @UploadedFile()
        file?: Express.Multer.File,
    ) {
        if (!file?.buffer) {
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
    async getProfile(@Req() req: any) {
        return this.profileService.getProfile(
            req.user.userId,
        );
    }

    // =====================================
    // GET COMPLETE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('complete')
    async getCompleteProfile(@Req() req: any) {
        return this.profileService.getCompleteProfile(
            req.user.userId,
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
        return this.profileService.updateProfile(
            req.user.userId,
            dto,
        );
    }

    // =====================================
    // DELETE PROFILE
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Delete()
    async deleteProfile(@Req() req: any) {
        return this.profileService.deleteProfile(
            req.user.userId,
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
        return this.profileService.updateBio(
            req.user.userId,
            dto.bio,
        );
    }

    // =====================================
    // GET BIO
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('bio')
    async getBio(@Req() req: any) {
        return this.profileService.getBio(
            req.user.userId,
        );
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
        return this.profileService.updateBio(
            req.user.userId,
            dto.bio,
        );
    }
}
