import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateIdentityTypeDto } from './dto/create-identity-type.dto';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // IDENTITY TYPES
  // ========================================

  async createIdentityType(dto: CreateIdentityTypeDto) {
    const existing =
      await this.prisma.client.orm.public.IdentityType
        .where({ slug: dto.slug })
        .first();

    if (existing) {
      throw new ConflictException(
        'Identity type with this slug already exists',
      );
    }

    return this.prisma.client.orm.public.IdentityType.create({
      name: dto.name,
      slug: dto.slug,
      isActive: true,
    });
  }

  async getIdentityTypes() {
    return this.prisma.client.orm.public.IdentityType
      .where({})
      .all();
  }

  async disableIdentityType(id: number) {
    const identityType =
      await this.prisma.client.orm.public.IdentityType
        .where({ id })
        .first();

    if (!identityType) {
      throw new NotFoundException(
        'Identity type not found',
      );
    }

    return this.prisma.client.orm.public.IdentityType
      .where({ id })
      .update({
        isActive: false,
      });
  }

  // ========================================
  // SKILL CATEGORIES
  // ========================================

  async createSkillCategory(dto: CreateSkillCategoryDto) {
    const existing =
      await this.prisma.client.orm.public.SkillCategory
        .where({ slug: dto.slug })
        .first();

    if (existing) {
      throw new ConflictException(
        'Skill category with this slug already exists',
      );
    }

    return this.prisma.client.orm.public.SkillCategory.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });
  }

  async getSkillCategories() {
    return this.prisma.client.orm.public.SkillCategory
      .where({})
      .all();
  }

  async disableSkillCategory(id: number) {
    const skillCategory =
      await this.prisma.client.orm.public.SkillCategory
        .where({ id })
        .first();

    if (!skillCategory) {
      throw new NotFoundException(
        'Skill category not found',
      );
    }

    return this.prisma.client.orm.public.SkillCategory
      .where({ id })
      .update({
        isActive: false,
      });
  }
}