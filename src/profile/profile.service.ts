
import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { v2 as cloudinary } from 'cloudinary';


import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,

    @Inject('CLOUDINARY')
    private readonly cloudinaryClient: typeof cloudinary,
  ) { }

  // =====================================
  // CREATE PROFILE
  // =====================================



  async createProfile(
    userId: number,
    dto: CreateProfileDto,
    file?: {
      buffer: Buffer;
      mimetype: string;
      size: number;
    },
  ) {
    const username = dto.username.trim().toLowerCase();

    const existingProfile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (existingProfile) {
      throw new ConflictException('User profile already exists');
    }

    const existingUsername =
      await this.prisma.client.orm.public.UserProfile
        .where({ username })
        .first();

    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Validate identity types
    for (const identityTypeId of dto.identityTypeIds) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({
            id: identityTypeId,
            isActive: true,
          })
          .first();

      if (!identityType) {
        throw new NotFoundException(
          `Identity type ${identityTypeId} not found`,
        );
      }
    }

    // Avatar is required
    if (!file?.buffer) {
      throw new BadRequestException('Avatar image is required');
    }

    // Validate image type
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

    // Validate image size
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Image size must not exceed 5 MB',
      );
    }

    // Upload avatar to Cloudinary
    const avatarUrl: string = await new Promise<string>(
      (resolve, reject) => {
        const stream = this.cloudinaryClient.uploader.upload_stream(
          {
            folder: 'evolv/avatars',
            public_id: `user_${userId}_${Date.now()}`,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            if (!result?.secure_url) {
              reject(new Error('Cloudinary returned no secure URL'));
              return;
            }

            resolve(result.secure_url);
          },
        );

        stream.end(file.buffer);
      },

    ).catch((error) => {
      console.error(
        'Cloudinary upload failed:',
        error?.message ?? error,
      );

      console.error(
        'Cloudinary error details:',
        JSON.stringify({
          name: error?.name,
          message: error?.message,
          http_code: error?.http_code,
        }),
      );

      throw new InternalServerErrorException(
        'Failed to upload avatar to Cloudinary',
      );
    });


    // Save profile with Cloudinary URL
    const profile =
      await this.prisma.client.orm.public.UserProfile.create({
        userId,
        username,
        avatarUrl,
        countryCode: dto.countryCode,
        ageRange: dto.ageRange,
        bio: dto.bio,
      });

    // Save identities
    const identities = [];

    for (const identityTypeId of dto.identityTypeIds) {
      const identity =
        await this.prisma.client.orm.public.UserIdentity.create({
          userId,
          identityTypeId,
          isPrimary:
            identityTypeId === dto.primaryIdentityTypeId,
        });

      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({ id: identityTypeId })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    return {
      success: true,
      message: 'Profile created successfully',
      profile,
      identities,
    };
  }

  // =====================================
  // GET PROFILE + IDENTITIES
  // =====================================

  async getProfile(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({ userId })
        .all();

    const identities = [];

    for (const identity of userIdentities) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({ id: identity.identityTypeId })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    return {
      profile,
      identities,
    };
  }

  // =====================================
  // UPLOAD AVATAR
  // =====================================

  async uploadAvatar(
    userId: number,
    file: {
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

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new BadRequestException(
        'Image size must not exceed 5 MB',
      );
    }

    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'Create your profile before uploading an avatar',
      );
    }

    if (!file.buffer) {
      throw new BadRequestException(
        'Image buffer is missing. Configure Multer memoryStorage.',
      );
    }

    let result: any;

    try {
      result = await new Promise<any>(
        (resolve, reject) => {
          const stream =
            this.cloudinaryClient.uploader.upload_stream(
              {
                folder: 'evolv/avatars',
                public_id: `user_${userId}_${Date.now()}`,
                resource_type: 'image',
              },
              (error, uploadResult) => {
                if (error) {
                  reject(error);
                  return;
                }

                if (!uploadResult) {
                  reject(
                    new Error(
                      'Cloudinary returned no upload result',
                    ),
                  );
                  return;
                }

                resolve(uploadResult);
              },
            );

          stream.end(file.buffer);
        },
      );
    } catch (error) {
      console.error('Cloudinary upload failed:', error);

      throw new InternalServerErrorException(
        'Failed to upload avatar',
      );
    }

    try {
      const updatedProfile =
        await this.prisma.client.orm.public.UserProfile
          .where({ userId })
          .update({
            avatarUrl: result.secure_url,
          });

      if (!updatedProfile) {
        throw new Error(
          'Profile avatar could not be updated',
        );
      }

      return {
        success: true,
        message: 'Avatar uploaded successfully',
        avatarUrl: updatedProfile.avatarUrl,
        profile: updatedProfile,
      };
    } catch (error) {
      console.error(
        'Failed to save avatar URL:',
        error,
      );

      throw new InternalServerErrorException(
        'Image uploaded, but failed to save avatar URL',
      );
    }
  }

  // =====================================
  // UPDATE PROFILE
  // =====================================

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    const updateData: any = {};

    if (dto.username !== undefined) {
      const username =
        dto.username.trim().toLowerCase();

      const existingUsername =
        await this.prisma.client.orm.public.UserProfile
          .where({ username })
          .first();

      if (
        existingUsername &&
        existingUsername.userId !== userId
      ) {
        throw new ConflictException(
          'Username already exists',
        );
      }

      updateData.username = username;
    }

    if (dto.avatarUrl !== undefined) {
      updateData.avatarUrl = dto.avatarUrl;
    }

    if (dto.countryCode !== undefined) {
      updateData.countryCode = dto.countryCode;
    }

    if (dto.ageRange !== undefined) {
      updateData.ageRange = dto.ageRange;
    }

    let updatedProfile = profile;

    if (Object.keys(updateData).length > 0) {
      const result =
        await this.prisma.client.orm.public.UserProfile
          .where({ userId })
          .update(updateData);

      if (result) {
        updatedProfile = result;
      }
    }

    if (dto.identityTypeIds !== undefined) {
      if (
        dto.primaryIdentityTypeId !== undefined &&
        !dto.identityTypeIds.includes(
          dto.primaryIdentityTypeId,
        )
      ) {
        throw new BadRequestException(
          'Primary identity must be included in identityTypeIds',
        );
      }

      for (const identityTypeId of dto.identityTypeIds) {
        const identityType =
          await this.prisma.client.orm.public.IdentityType
            .where({
              id: identityTypeId,
              isActive: true,
            })
            .first();

        if (!identityType) {
          throw new NotFoundException(
            `Identity type ${identityTypeId} not found`,
          );
        }
      }

      const oldIdentities =
        await this.prisma.client.orm.public.UserIdentity
          .where({ userId })
          .all();

      for (const identity of oldIdentities) {
        await this.prisma.client.orm.public.UserIdentity
          .where({
            id: identity.id,
            userId,
          })
          .delete();
      }

      for (const identityTypeId of dto.identityTypeIds) {
        await this.prisma.client.orm.public.UserIdentity.create({
          userId,
          identityTypeId,
          isPrimary:
            identityTypeId === dto.primaryIdentityTypeId,
        });
      }
    }

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({ userId })
        .all();

    const identities = [];

    for (const identity of userIdentities) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({ id: identity.identityTypeId })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    return {
      profile: updatedProfile,
      identities,
    };
  }

  // =====================================
  // DELETE PROFILE
  // =====================================

  async deleteProfile(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    return this.prisma.client.orm.public.UserProfile
      .where({ userId })
      .delete();
  }

  // =====================================
  // ADD / UPDATE BIO
  // =====================================

  async updateBio(
    userId: number,
    bio?: string,
  ) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    await this.prisma.client.orm.public.UserProfile
      .where({ userId })
      .update({
        bio: bio ?? null,
      });

    return {
      bio: bio ?? null,
    };
  }

  // =====================================
  // GET BIO
  // =====================================

  async getBio(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    return {
      bio: profile.bio,
    };
  }

  // =====================================
  // GET COMPLETE PROFILE
  // =====================================

  async getCompleteProfile(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({ userId })
        .all();

    const identities = [];

    for (const identity of userIdentities) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({ id: identity.identityTypeId })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    const curiosities =
      await this.prisma.client.orm.public.UserCuriosity
        .where({ userId })
        .all();

    const skills =
      await this.prisma.client.orm.public.UserSkill
        .where({ userId })
        .all();

    return {
      profile,
      identities,
      curiosities,
      skills,
    };
  }
}
