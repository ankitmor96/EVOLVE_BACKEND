import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  // =====================================
  // CREATE PROFILE
  // =====================================

  async createProfile(
    userId: number,
    dto: CreateProfileDto,
  ) {
    const username = dto.username.trim().toLowerCase();

    // =====================================
    // CHECK PROFILE ALREADY EXISTS
    // =====================================

    const existingProfile =
      await this.prisma.client.orm.public.UserProfile
        .where({
          userId,
        })
        .first();

    if (existingProfile) {
      throw new Error('User profile already exists');
    }

    // =====================================
    // CREATE PROFILE
    // =====================================

    const profile =
      await this.prisma.client.orm.public.UserProfile.create({
        userId,
        username,
        avatarUrl: dto.avatarUrl,
        countryCode: dto.countryCode,
        ageRange: dto.ageRange,
        bio: dto.bio,
      });

    // =====================================
    // CREATE USER IDENTITIES
    // =====================================

    const identities = [];

    for (const identityTypeId of dto.identityTypeIds) {
      const identity =
        await this.prisma.client.orm.public.UserIdentity.create({
          userId,
          identityTypeId,
          isPrimary:
            identityTypeId === dto.primaryIdentityTypeId,
        });

      // Get IdentityType details
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({
            id: identityTypeId,
          })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    // =====================================
    // RESPONSE
    // =====================================

    return {
      profile,
      identities,
    };
  }

  // =====================================
  // GET PROFILE
  // =====================================

  async getProfile(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({
          userId,
        })
        .first();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // =====================================
    // GET USER IDENTITIES
    // =====================================

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({
          userId,
        })
        .all();

    // =====================================
    // GET IDENTITY TYPE DETAILS
    // =====================================

    const identities = [];

    for (const identity of userIdentities) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({
            id: identity.identityTypeId,
          })
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
  // UPDATE PROFILE
  // =====================================

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ) {
    // =====================================
    // CHECK PROFILE
    // =====================================

    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({ userId })
        .first();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // =====================================
    // PROFILE UPDATE DATA
    // =====================================

    const updateData: any = {};

    // Username
    if (dto.username !== undefined) {
      const username = dto.username.trim().toLowerCase();

      const existingUsername =
        await this.prisma.client.orm.public.UserProfile
          .where({ username })
          .first();

      if (
        existingUsername &&
        existingUsername.userId !== userId
      ) {
        throw new Error('Username already exists');
      }

      updateData.username = username;
    }

    // Avatar
    if (dto.avatarUrl !== undefined) {
      updateData.avatarUrl = dto.avatarUrl;
    }

    // Country
    if (dto.countryCode !== undefined) {
      updateData.countryCode = dto.countryCode;
    }

    // Age
    if (dto.ageRange !== undefined) {
      updateData.ageRange = dto.ageRange;
    }

    // =====================================
    // UPDATE PROFILE
    // =====================================

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

    // =====================================
    // UPDATE IDENTITIES
    // =====================================

    if (dto.identityTypeIds !== undefined) {

      // -------------------------------------
      // Validate primary identity
      // -------------------------------------

      if (
        dto.primaryIdentityTypeId !== undefined &&
        !dto.identityTypeIds.includes(
          dto.primaryIdentityTypeId,
        )
      ) {
        throw new Error(
          'Primary identity must be included in identityTypeIds',
        );
      }

      // -------------------------------------
      // Check IdentityTypes exist
      // -------------------------------------

      for (const identityTypeId of dto.identityTypeIds) {
        const identityType =
          await this.prisma.client.orm.public.IdentityType
            .where({
              id: identityTypeId,
              isActive: true,
            })
            .first();

        if (!identityType) {
          throw new Error(
            `Identity type ${identityTypeId} not found`,
          );
        }
      }

      // -------------------------------------
      // Get old identities
      // -------------------------------------

      const oldIdentities =
        await this.prisma.client.orm.public.UserIdentity
          .where({ userId })
          .all();

      // -------------------------------------
      // Delete old identities
      // -------------------------------------

      for (const identity of oldIdentities) {
        await this.prisma.client.orm.public.UserIdentity
          .where({
            id: identity.id,
            userId,
          })
          .delete();
      }

      // -------------------------------------
      // Create new identities
      // -------------------------------------

      for (const identityTypeId of dto.identityTypeIds) {
        await this.prisma.client.orm.public.UserIdentity.create({
          userId,
          identityTypeId,
          isPrimary:
            identityTypeId === dto.primaryIdentityTypeId,
        });
      }
    }

    // =====================================
    // GET UPDATED IDENTITIES
    // =====================================

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({ userId })
        .all();

    const identities = [];

    for (const identity of userIdentities) {

      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({
            id: identity.identityTypeId,
          })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    // =====================================
    // FINAL RESPONSE
    // =====================================

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
        .where({
          userId,
        })
        .first();

    if (!profile) {
      throw new Error('User profile not found');
    }

    return this.prisma.client.orm.public.UserProfile
      .where({
        userId,
      })
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
        .where({
          userId,
        })
        .first();

    if (!profile) {
      throw new Error('User profile not found');
    }

    await this.prisma.client.orm.public.UserProfile
      .where({
        userId,
      })
      .update({
        bio: bio ?? null,
      });

    return {
      bio: bio ?? null,
    };
  }

  // =====================================
  // GET COMPLETE PROFILE
  // =====================================

  async getCompleteProfile(userId: number) {
    const profile =
      await this.prisma.client.orm.public.UserProfile
        .where({
          userId,
        })
        .first();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // =====================================
    // GET USER IDENTITIES
    // =====================================

    const userIdentities =
      await this.prisma.client.orm.public.UserIdentity
        .where({
          userId,
        })
        .all();

    const identities = [];

    for (const identity of userIdentities) {
      const identityType =
        await this.prisma.client.orm.public.IdentityType
          .where({
            id: identity.identityTypeId,
          })
          .first();

      identities.push({
        ...identity,
        identityType,
      });
    }

    // =====================================
    // GET USER CURIOSITIES
    // =====================================

    const curiosities =
      await this.prisma.client.orm.public.UserCuriosity
        .where({
          userId,
        })
        .all();

    // =====================================
    // GET USER SKILLS
    // =====================================

    const skills =
      await this.prisma.client.orm.public.UserSkill
        .where({
          userId,
        })
        .all();

    // =====================================
    // COMPLETE PROFILE RESPONSE
    // =====================================

    return {
      profile,
      identities,
      curiosities,
      skills,
    };
  }
}