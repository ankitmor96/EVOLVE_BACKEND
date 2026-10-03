import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateUserCuriosityDto } from './dto/create-user-curiosity.dto';

import { UpdateUserCuriosityDto } from './dto/update-user-curiosity.dto';

import { CreateUserSkillDto } from './dto/create-user-skill.dto';

import { UpdateUserSkillDto } from './dto/update-user-skill.dto';

@Injectable()
export class SkillService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

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

            // Check whether this curiosity already exists
            const existing =
                await this.prisma.client.orm.public.UserCuriosity
                    .where({
                        userId,
                        skillId,
                    })
                    .first();

            let curiosity;

            if (existing) {
                // Already exists → return existing record
                curiosity = existing;
            } else {
                // Doesn't exist → create new record
                curiosity =
                    await this.prisma.client.orm.public.UserCuriosity.create({
                        userId,
                        skillId,
                    });
            }

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

        const curiosities = [];

        // Create new curiosity selections
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

    // =====================================
// CREATE USER SKILLS
// =====================================

async createUserSkills(
    userId: number,
    dto: CreateUserSkillDto,
) {
    const skills = [];

    for (const skillId of dto.skill) {

        // Check whether same skill + relationship already exists
        const existing =
            await this.prisma.client.orm.public.UserSkill
                .where({
                    userId,
                    skillId,
                    relationshipType: dto.relationshipType,
                })
                .first();

        let skill;

        if (existing) {
            // Already exists → return existing record
            skill = existing;
        } else {
            // Doesn't exist → create new record
            skill =
                await this.prisma.client.orm.public.UserSkill.create({
                    userId,
                    skillId,
                    relationshipType: dto.relationshipType,
                });
        }

        skills.push(skill);
    }

    return {
        relationshipType: dto.relationshipType,
        skill: skills.map((item) => item.skillId),
        data: skills,
    };
}
    // =====================================
    // GET USER SKILLS
    // =====================================

    async getUserSkills(userId: number) {
        return this.prisma.client.orm.public.UserSkill
            .where({
                userId,
            })
            .all();
    }

    // =====================================
    // UPDATE USER SKILL
    // =====================================

    async updateUserSkill(
        userId: number,
        userSkillId: number,
        dto: UpdateUserSkillDto,
    ) {
        const userSkill =
            await this.prisma.client.orm.public.UserSkill
                .where({
                    id: userSkillId,
                    userId,
                })
                .first();

        if (!userSkill) {
            throw new Error('User skill not found');
        }

        if (dto.skill.length !== 1) {
            throw new Error(
                'Only one skill can be updated at a time',
            );
        }

        return this.prisma.client.orm.public.UserSkill
            .where({
                id: userSkillId,
                userId,
            })
            .update({
                skillId: dto.skill[0],
                relationshipType: dto.relationshipType,
            });
    }
    // =====================================
    // DELETE USER SKILL
    // =====================================

    async deleteUserSkill(
        userId: number,
        userSkillId: number,
    ) {

        const userSkill =
            await this.prisma.client.orm.public.UserSkill
                .where({
                    id: userSkillId,
                    userId,
                })
                .first();

        if (!userSkill) {
            throw new Error('User skill not found');
        }

        return this.prisma.client.orm.public.UserSkill
            .where({
                id: userSkillId,
                userId,
            })
            .delete();
    }
}