
import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    // Admin Login
    async login(data: {
        email: string;
        password: string;
    }) {
        const admin = await this.prisma.client.orm.public.Admin
            .where({ email: data.email })
            .first();

        if (!admin || admin.password !== data.password) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (admin.status !== 'ACTIVE') {
            throw new UnauthorizedException('Admin account is not active');
        }

        return {
            message: 'Admin login successful',
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                status: admin.status,
                lastLoginAt: admin.lastLoginAt,
                createdAt: admin.createdAt,
                updatedAt: admin.updatedAt,
            },
        };
    }


    async getDashboardSummary() {
        const [users, posts, reactions] = await Promise.all([
            this.prisma.client.orm.public.User
                .where({})
                .all(),

            this.prisma.client.orm.public.Post
                .where({})
                .all(),

            this.prisma.client.orm.public.PostReaction
                .where({})
                .all(),
        ]);

        return {
            success: true,
            data: {
                totalUsers: users.length,
                totalPosts: posts.length,
                totalReactions: reactions.length,
            },
        };
    }



    async getAllUsers(page = 1, limit = 100) {
        // Validate pagination
        page = Number(page);
        limit = Number(limit);

        if (!Number.isInteger(page) || page < 1) {
            throw new BadRequestException('Invalid page number');
        }

        if (!Number.isInteger(limit) || limit < 1) {
            throw new BadRequestException('Invalid limit');
        }

        // Maximum 100 records per request
        limit = Math.min(limit, 100);

        const offset = (page - 1) * limit;

        // Total users count directly from database
        const allUsers = await this.prisma.client.orm.public.User.all();
        const total = allUsers.length;

        // Fetch only current page users from database
        const users = await this.prisma.client.orm.public.User
            .orderBy((user) => user.createdAt.desc())
            .limit(limit)
            .offset(offset)
            .all();

        const userIds = users.map((user) => user.id);

        // Fetch related data only for current page users
        const [profiles, identities] = await Promise.all([
            userIds.length > 0
                ? this.prisma.client.orm.public.UserProfile
                    .where((profile) => profile.userId.in(userIds))
                    .all()
                : [],

            userIds.length > 0
                ? this.prisma.client.orm.public.UserIdentity
                    .where((identity) => identity.userId.in(userIds))
                    .all()
                : [],
        ]);

        const identityTypeIds = [
            ...new Set(
                identities.map((identity) => identity.identityTypeId),
            ),
        ];

        const identityTypes = identityTypeIds.length > 0
            ? await this.prisma.client.orm.public.IdentityType
                .where((type) => type.id.in(identityTypeIds))
                .all()
            : [];

        // Prepare response
        const data = users.map((user) => {
            const profile = profiles.find(
                (item) => Number(item.userId) === Number(user.id),
            );

            const userIdentities = identities.filter(
                (item) => Number(item.userId) === Number(user.id),
            );

            const identityNames = userIdentities
                .map((identity) =>
                    identityTypes.find(
                        (type) =>
                            Number(type.id) ===
                            Number(identity.identityTypeId),
                    )?.name ?? null,
                )
                .filter(Boolean);

            return {
                userId: Number(user.id),
                username: profile?.username ?? null,
                avatarUrl: profile?.avatarUrl ?? null,
                identity: identityNames,
                createdAt: user.createdAt,
                country: profile?.countryCode ?? null,
            };
        });

        const totalPages = Math.ceil(total / limit);

        return {
            success: true,
            message: 'Users fetched successfully',
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
            data,
        };
    }


    // Get All Posts for Admin Panel

    async getAllPosts(page = 1, limit = 100) {
        page = Number(page);
        limit = Number(limit);

        if (!Number.isInteger(page) || page < 1) {
            throw new BadRequestException('Invalid page number');
        }

        if (!Number.isInteger(limit) || limit < 1) {
            throw new BadRequestException('Invalid limit');
        }

        limit = Math.min(limit, 100);

        const offset = (page - 1) * limit;

        // Total posts count
        const allPosts = await this.prisma.client.orm.public.Post
            .where({})
            .all();

        const total = allPosts.length;

        // Fetch only current page posts
        const posts = await this.prisma.client.orm.public.Post
            .where({})
            .orderBy((post) => post.createdAt.desc())
            .limit(limit)
            .offset(offset)
            .all();

        if (posts.length === 0) {
            const totalPages = Math.ceil(total / limit);

            return {
                success: true,
                message: 'All posts fetched successfully',
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
                data: [],
            };
        }

        const postIds = posts.map((post) => Number(post.id));
        const userIds = [...new Set(posts.map((post) => Number(post.userId)))];

        const [users, userProfiles, media, postSkills, reactions, learningRecords] =
            await Promise.all([
                this.prisma.client.orm.public.User
                    .where((user) => user.id.in(userIds)).all(),

                this.prisma.client.orm.public.UserProfile
                    .where((profile) => profile.userId.in(userIds)).all(),

                this.prisma.client.orm.public.PostMedia
                    .where((item) => item.postId.in(postIds))
                    .orderBy((item) => item.position.asc()).all(),

                this.prisma.client.orm.public.PostSkill
                    .where((item) => item.postId.in(postIds)).all(),

                this.prisma.client.orm.public.PostReaction
                    .where((item) => item.postId.in(postIds)).all(),

                this.prisma.client.orm.public.PostLearning
                    .where((item) => item.postId.in(postIds)).all(),
            ]);

        const skillIds = [...new Set(
            postSkills.map((item) => Number(item.skillId)),
        )];

        const skills = skillIds.length > 0
            ? await this.prisma.client.orm.public.Skill
                .where((skill) => skill.id.in(skillIds)).all()
            : [];

        const data = posts.map((post) => {
            const postId = Number(post.id);
            const userId = Number(post.userId);

            const postReactions = reactions.filter(
                (reaction) => Number(reaction.postId) === postId,
            );

            const postLearningRecords = learningRecords.filter(
                (learning) => Number(learning.postId) === postId,
            );

            return {
                ...post,

                user: {
                    name: users.find(
                        (user) => Number(user.id) === userId,
                    )?.name ?? null,

                    avatarUrl: userProfiles.find(
                        (profile) => Number(profile.userId) === userId,
                    )?.avatarUrl ?? null,
                },

                media: media.filter(
                    (item) => Number(item.postId) === postId,
                ),

                skills: postSkills
                    .filter((item) => Number(item.postId) === postId)
                    .map((postSkill) => {
                        const skill = skills.find(
                            (item) => Number(item.id) === Number(postSkill.skillId),
                        );

                        return skill
                            ? {
                                skillId: Number(skill.id),
                                skillName: String(skill.name),
                            }
                            : null;
                    })
                    .filter((skill) => skill !== null),

                reactionCounts: {
                    APPRECIATE: postReactions.filter(
                        (item) => item.reactionType === 'APPRECIATE',
                    ).length,

                    HELPFUL: postReactions.filter(
                        (item) => item.reactionType === 'HELPFUL',
                    ).length,
                },

                learningCount: postLearningRecords.length,
            };
        });

        const totalPages = Math.ceil(total / limit);

        return {
            success: true,
            message: 'All posts fetched successfully',

            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },

            data,
        };
    }


}
