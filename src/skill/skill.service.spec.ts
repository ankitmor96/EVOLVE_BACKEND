import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateUserCuriosityDto } from './dto/create-user-curiosity.dto';

import { UpdateUserCuriosityDto } from './dto/update-user-curiosity.dto';

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =====================================
  // GET ALL SKILL CATEGORIES
  // =====================================

  async getSkillCategories() {
    return this.prisma.client.orm.public.SkillCategory
      .where({
        isActive: true,
      })
      .all();
  }

  // =====================================
  // GET SKILLS BY CATEGORY
  // =====================================

  async getSkillsByCategory(categoryId: number) {
    return this.prisma.client.orm.public.Skill
      .where({
        categoryId,
        isActive: true,
      })
      .all();
  }

  // =====================================
  // CREATE USER CURIOSITY
  // =====================================

  async createUserCuriosity(
    userId: number,
    dto: CreateUserCuriosityDto,
  ) {
    const curiosities = [];

    for (const skillId of dto.skillIds) {
      const curiosity =
        await this.prisma.client.orm.public.UserCuriosity.upsert({
          create: {
            userId,
            skillId,
          },

          update: {},

          conflictOn: {
            userId_skillId: {
              userId,
              skillId,
            },
          },
        });

      curiosities.push(curiosity);
    }

    return curiosities;
  }

  // =====================================
  // GET USER CURIOSITY
  // =====================================

  async getUserCuriosity(userId: number) {
    return this.prisma.client.orm.public.UserCuriosity
      .where({
        userId,
      })
      .all();
  }

  // =====================================
  // UPDATE USER CURIOSITY
  // =====================================

  async updateUserCuriosity(
    userId: number,
    dto: UpdateUserCuriosityDto,
  ) {
    // Delete existing curiosity selections
    await this.prisma.client.orm.public.UserCuriosity
      .where({
        userId,
      })
      .delete();

    // Add new curiosity selections
    const curiosities = [];

    for (const skillId of dto.skillIds) {
      const curiosity =
        await this.prisma.client.orm.public.UserCuriosity.create({
          userId,
          skillId,
        });

      curiosities.push(curiosity);
    }

    return curiosities;
  }

  // =====================================
  // DELETE USER CURIOSITY
  // =====================================

  async deleteUserCuriosity(
    userId: number,
    curiosityId: number,
  ) {
    const curiosity =
      await this.prisma.client.orm.public.UserCuriosity
        .where({
          id: curiosityId,
          userId,
        })
        .first();

    if (!curiosity) {
      throw new Error('User curiosity not found');
    }

    return this.prisma.client.orm.public.UserCuriosity
      .where({
        id: curiosityId,
        userId,
      })
      .delete();
  }
}