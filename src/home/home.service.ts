import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HomeService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // ========================================
    // GET HOME TABS
    // ========================================

    async getHomeTabs(userId: number) {
        // 1. Get user's selected skills
        const userSkills =
            await this.prisma.client.orm.public.UserSkill
                .where({ userId })
                .all();

        // 2. Get user's curiosity skills
        const curiosities =
            await this.prisma.client.orm.public.UserCuriosity
                .where({ userId })
                .all();

        // 3. Collect skill IDs
        const skillIds = [
            ...new Set([
                ...userSkills.map((item: any) => item.skillId),
                ...curiosities.map((item: any) => item.skillId),
            ]),
        ];

        // 4. Get selected skills and their categories
        const selectedSkills = await Promise.all(
            skillIds.map(async (skillId) => {
                const skill =
                    await this.prisma.client.orm.public.Skill
                        .where({ id: skillId })
                        .first();

                if (!skill || !skill.isActive) {
                    return null;
                }

                const category =
                    await this.prisma.client.orm.public.SkillCategory
                        .where({ id: skill.categoryId })
                        .first();

                if (!category || !category.isActive) {
                    return null;
                }

                return {
                    id: skill.id,
                    name: skill.name,
                    slug: skill.slug,
                    categoryId: category.id,
                    categoryName: category.name,
                    categorySlug: category.slug,
                };
            }),
        );

        // 5. Remove unavailable skills
        const validSkills = selectedSkills.filter(
            (skill) => skill !== null,
        );

        // 6. Create unique category tabs
        const categories = [
            ...new Map(
                validSkills.map((skill) => [
                    skill.categoryId,
                    {
                        id: skill.categoryId,
                        name: skill.categoryName,
                        slug: skill.categorySlug,
                    },
                ]),
            ).values(),
        ];

        // 7. Return Home tabs and selected skills
        return {
            success: true,
            tabs: [
                {
                    key: 'for-you',
                    label: 'For You',
                    type: 'default',
                },
                {
                    key: 'learning',
                    label: 'Learning',
                    type: 'default',
                },
                {
                    key: 'discover',
                    label: 'Discover',
                    type: 'default',
                },
                ...categories.map((category) => ({
                    key: category.slug,
                    label: category.name,
                    type: 'category',
                    categoryId: category.id,
                })),
            ],
            selectedSkills: validSkills,
        };
    }
}