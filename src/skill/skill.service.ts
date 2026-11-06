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
        if (!Array.isArray(dto.skillIds)) {
            throw new Error('skillIds must be an array');
        }

        // Remove duplicate skill IDs
        const requestedSkillIds = [
            ...new Set(dto.skillIds.map(Number)),
        ];

        // Get existing curiosity records
        const existingCuriosities =
            await this.prisma.client.orm.public.UserCuriosity
                .where({ userId })
                .all();

        const existingSkillIds = existingCuriosities.map(
            (item) => item.skillId,
        );

        // Find records which user has removed
        const recordsToDelete = existingCuriosities.filter(
            (item) => !requestedSkillIds.includes(Number(item.skillId)),
        );

        // Delete removed records individually
        for (const item of recordsToDelete) {
            await this.prisma.client.orm.public.UserCuriosity
                .where({
                    id: item.id,
                    userId,
                })
                .delete();
        }

        // Create only newly selected skills
        const createdCuriosities = [];

        for (const skillId of requestedSkillIds) {
            if (!existingSkillIds.includes(skillId)) {
                const curiosity =
                    await this.prisma.client.orm.public.UserCuriosity.create({
                        userId,
                        skillId,
                    });

                createdCuriosities.push(curiosity);
            }
        }

        // Return latest data
        const updatedCuriosities =
            await this.prisma.client.orm.public.UserCuriosity
                .where({ userId })
                .all();

        return {
            success: true,
            message: 'User curiosity updated successfully',
            data: updatedCuriosities,
        };
    }

    // =====================================
    // DELETE USER CURIOSITY
    // =====================================

    async deleteUserCuriosity(
        userId: number,
        skillId: number,
    ) {
        // Find curiosity using userId + skillId
        const curiosity =
            await this.prisma.client.orm.public.UserCuriosity
                .where({
                    userId,
                    skillId,
                })
                .first();

        // If already deleted, return success
        if (!curiosity) {
            return {
                success: true,
                message: 'Curiosity already removed',
                skillId,
            };
        }

        // Delete actual UserCuriosity record internally
        await this.prisma.client.orm.public.UserCuriosity
            .where({
                id: curiosity.id,
                userId,
            })
            .delete();

        return {
            success: true,
            message: 'Curiosity deleted successfully',
            skillId,
        };
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
    // UPDATE MULTIPLE USER SKILLS
    // =====================================

    async updateUserSkill(
        userId: number,
        userSkillId: number,
        dto: UpdateUserSkillDto,
    ) {
        // Find existing user skill
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

        // Validate skill array
        if (!dto.skill || dto.skill.length === 0) {
            throw new Error('At least one skill is required');
        }

        // Remove duplicate skill IDs
        const skillIds = [...new Set(dto.skill)];

        // Get existing user skills
        const existingSkills =
            await this.prisma.client.orm.public.UserSkill
                .where({
                    userId,
                })
                .all();

        // Remove old records belonging to the existing
        // and requested relationship types
        const recordsToDelete = existingSkills.filter(
            (item) =>
                item.relationshipType === userSkill.relationshipType ||
                item.relationshipType === dto.relationshipType,
        );

        for (const item of recordsToDelete) {
            await this.prisma.client.orm.public.UserSkill
                .where({
                    id: item.id,
                    userId,
                })
                .delete();
        }

        // Create updated multiple skills
        const updatedSkills = [];

        for (const skillId of skillIds) {
            const skill =
                await this.prisma.client.orm.public.UserSkill.create({
                    userId,
                    skillId,
                    relationshipType: dto.relationshipType,
                });

            updatedSkills.push(skill);
        }

        return {
            success: true,
            message: 'User skills updated successfully',
            relationshipType: dto.relationshipType,
            skill: skillIds,
            data: updatedSkills,
        };
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


    // =====================================
    // GET USER PROFILE SKILLS & IDENTITIES
    // =====================================

    async getSkillsByUserId(userId: number) {

        // USER IDENTITY
        const userIdentities =
            await this.prisma.client.orm.public.UserIdentity
                .where({ userId })
                .all();

        const identities = [];

        for (const item of userIdentities) {
            const identityType =
                await this.prisma.client.orm.public.IdentityType
                    .where({ id: item.identityTypeId })
                    .first();

            identities.push({
                ...item,
                identityType,
            });
        }

        // USER CURIOSITY
        const userCuriosities =
            await this.prisma.client.orm.public.UserCuriosity
                .where({ userId })
                .all();

        const curiosities = [];

        for (const item of userCuriosities) {
            const skill =
                await this.prisma.client.orm.public.Skill
                    .where({ id: item.skillId })
                    .first();

            const category = skill
                ? await this.prisma.client.orm.public.SkillCategory
                    .where({ id: skill.categoryId })
                    .first()
                : null;

            curiosities.push({
                ...item,
                skill,
                category,
            });
        }

        // USER SKILLS
        const userSkills =
            await this.prisma.client.orm.public.UserSkill
                .where({ userId })
                .all();

        const skills = [];

        for (const item of userSkills) {
            const skill =
                await this.prisma.client.orm.public.Skill
                    .where({ id: item.skillId })
                    .first();

            const category = skill
                ? await this.prisma.client.orm.public.SkillCategory
                    .where({ id: skill.categoryId })
                    .first()
                : null;

            skills.push({
                ...item,
                skill,
                category,
            });
        }

        return {
            success: true,
            userId,
            identities,
            curiosities,
            skills,
        };
    }

}