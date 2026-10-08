import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateIdentityTypeDto } from './dto/create-identity-type.dto';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';
import { CreateSkillDto } from './dto/create-skill.dto';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

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

    // ========================================
    // SKILLS
    // ========================================

    async createSkill(dto: CreateSkillDto) {
        // Check category exists
        const category =
            await this.prisma.client.orm.public.SkillCategory
                .where({ id: dto.categoryId })
                .first();

        if (!category) {
            throw new NotFoundException(
                'Skill category not found',
            );
        }

        // Check duplicate slug
        const existing =
            await this.prisma.client.orm.public.Skill
                .where({ slug: dto.slug })
                .first();

        if (existing) {
            throw new ConflictException(
                'Skill with this slug already exists',
            );
        }

        return this.prisma.client.orm.public.Skill.create({
            categoryId: dto.categoryId,
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            isActive: true,
        });
    }

    async getSkills() {
        return this.prisma.client.orm.public.Skill
            .where({})
            .all();
    }

    async disableSkill(id: number) {
        const skill =
            await this.prisma.client.orm.public.Skill
                .where({ id })
                .first();

        if (!skill) {
            throw new NotFoundException(
                'Skill not found',
            );
        }

        return this.prisma.client.orm.public.Skill
            .where({ id })
            .update({
                isActive: false,
            });
    }
}