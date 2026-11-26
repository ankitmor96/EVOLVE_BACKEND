
import {
    Injectable,
    Inject,
    OnModuleDestroy,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
    ConflictException,
} from '@nestjs/common';

import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';

import { PrismaService } from '../prisma/prisma.service';

type ContentType = 'VIDEO' | 'TEXT' | 'IMAGE' | 'LONG_FORM';

interface LearningSession {
    sessionId: string;
    userId: number;
    postId: number;
    contentType: ContentType;
    thresholdSeconds: number;
    activeSeconds: number;
    persistedSeconds: number;
    maxCompletionPercentage: number;
    counted: boolean;
    ended: boolean;
    startedAt: number;
    lastProgressAt: number;
}

@Injectable()
export class LearningService implements OnModuleDestroy {
    private readonly SESSION_TTL = 2 * 60 * 60;
    private readonly MAX_PROGRESS_SECONDS = 10;

    private readonly THRESHOLDS: Record<ContentType, number> = {
        VIDEO: 5,
        TEXT: 3,
        IMAGE: 3,
        LONG_FORM: 10,
    };

    constructor(
        private readonly prisma: PrismaService,

        @Inject('LEARNING_REDIS')
        private readonly redis: Redis,
    ) { }

    async onModuleDestroy() {
        if (this.redis.status !== 'end') {
            await this.redis.quit();
        }
    }

    // =========================================
    // CONTENT TYPE DETECTION
    // =========================================

    private async getContentType(post: any): Promise<ContentType> {
        const media = await this.prisma.client.orm.public.PostMedia
            .where({
                postId: post.id,
            })
            .all();

        const hasDocument = media.some(
            (item: any) => item.mediaType === 'DOCUMENT',
        );

        if (post.postType === 'VIDEO') {
            return 'VIDEO';
        }

        if (post.postType === 'IMAGE') {
            return 'IMAGE';
        }

        if (post.postType === 'TEXT' && hasDocument) {
            return 'LONG_FORM';
        }

        if (post.postType === 'TEXT') {
            return 'TEXT';
        }

        throw new BadRequestException(
            'This post type is not supported for exploration tracking',
        );
    }

    // =========================================
    // POST ACCESS VALIDATION
    // =========================================

    private async validatePostAccess(
        userId: number,
        postId: number,
    ) {
        const post = await this.prisma.client.orm.public.Post
            .where({
                id: postId,
                deletedAt: null,
            })
            .first();

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        if (
            post.status !== 'PUBLISHED' ||
            !post.publishedAt
        ) {
            throw new BadRequestException(
                'Post is not published',
            );
        }

        // Post owner can explore own post.
        if (Number(post.userId) === userId) {
            return post;
        }

        // Other users can only explore approved posts.
        // Enable this check when moderation approval is required.
        /*
        if (post.moderation_status !== 'APPROVED') {
            throw new ForbiddenException(
                'This post is not available',
            );
        }
        */

        if (post.visibility === 'PUBLIC') {
            return post;
        }

        if (post.visibility === 'CONNECTIONS') {
            const connections =
                await this.prisma.client.orm.public.Connection
                    .where((connection: any) =>
                        connection.status.eq('ACCEPTED'),
                    )
                    .all();

            const isConnected = connections.some(
                (connection: any) => {
                    const first =
                        Number(connection.requesterId) === userId &&
                        Number(connection.receiverId) === Number(post.userId);

                    const second =
                        Number(connection.receiverId) === userId &&
                        Number(connection.requesterId) === Number(post.userId);

                    return first || second;
                },
            );

            if (!isConnected) {
                throw new ForbiddenException(
                    'You are not connected with this user',
                );
            }

            return post;
        }

        throw new ForbiddenException(
            'You do not have permission to explore this post',
        );
    }

    // =========================================
    // START TRACKING
    // POST /v1/learning/track/start
    // =========================================

    async startTracking(
        userId: number,
        postId: number,
    ) {
        if (
            !Number.isInteger(postId) ||
            postId <= 0
        ) {
            throw new BadRequestException('Invalid postId');
        }

        const post = await this.validatePostAccess(
            userId,
            postId,
        );

        const contentType = await this.getContentType(post);

        const sessionId = randomUUID();

        // Keep milliseconds as number for Redis calculations.
        const now = Date.now();

        const session: LearningSession = {
            sessionId,
            userId,
            postId,
            contentType,

            thresholdSeconds:
                this.THRESHOLDS[contentType],

            activeSeconds: 0,
            persistedSeconds: 0,
            maxCompletionPercentage: 0,

            counted: false,
            ended: false,

            startedAt: now,
            lastProgressAt: now,
        };

        await this.redis.set(
            `learning:session:${sessionId}`,
            JSON.stringify(session),
            'EX',
            this.SESSION_TTL,
        );

        return {
            success: true,
            message: 'Learning tracking started',
            sessionId,
            postId,
            contentType,
            thresholdSeconds: session.thresholdSeconds,
        };
    }

    // =========================================
    // REDIS SESSION HELPER
    // =========================================

    private async getSession(
        sessionId: string,
        userId: number,
    ): Promise<LearningSession> {
        if (
            typeof sessionId !== 'string' ||
            sessionId.length > 100
        ) {
            throw new BadRequestException(
                'Invalid sessionId',
            );
        }

        const sessionData = await this.redis.get(
            `learning:session:${sessionId}`,
        );

        if (!sessionData) {
            throw new NotFoundException(
                'Learning session not found or expired',
            );
        }

        const session: LearningSession =
            JSON.parse(sessionData);

        if (session.userId !== userId) {
            throw new ForbiddenException(
                'This session does not belong to you',
            );
        }

        if (session.ended) {
            throw new BadRequestException(
                'Learning session already ended',
            );
        }

        return session;
    }

    // =========================================
    // PROGRESS TRACKING
    // POST /v1/learning/track/progress
    // =========================================

    async trackProgress(
        userId: number,
        dto: {
            sessionId: string;
            progressId: string;
            activeSeconds: number;
            completionPercentage: number;
            isActive: boolean;
        },
    ) {
        const {
            sessionId,
            progressId,
            activeSeconds,
            completionPercentage,
            isActive,
        } = dto;

        if (
            typeof progressId !== 'string' ||
            progressId.length < 10 ||
            progressId.length > 100
        ) {
            throw new BadRequestException(
                'Invalid progressId',
            );
        }

        if (
            !Number.isInteger(activeSeconds) ||
            activeSeconds < 0 ||
            activeSeconds > this.MAX_PROGRESS_SECONDS
        ) {
            throw new BadRequestException(
                'activeSeconds must be between 0 and 10',
            );
        }

        if (
            typeof completionPercentage !== 'number' ||
            !Number.isFinite(completionPercentage) ||
            completionPercentage < 0 ||
            completionPercentage > 100
        ) {
            throw new BadRequestException(
                'completionPercentage must be between 0 and 100',
            );
        }

        if (typeof isActive !== 'boolean') {
            throw new BadRequestException(
                'isActive must be boolean',
            );
        }

        const session = await this.getSession(
            sessionId,
            userId,
        );

        // Revalidate post access during tracking.
        await this.validatePostAccess(
            userId,
            session.postId,
        );

        // Prevent duplicate progress request.
        const progressKey =
            `learning:progress:${sessionId}`;

        const alreadyProcessed = await this.redis.sismember(
            progressKey,
            progressId,
        );

        if (alreadyProcessed) {
            return {
                success: true,
                duplicate: true,
                message: 'Progress already processed',
                qualified: session.counted,
            };
        }

        // Keep milliseconds as number for calculations.
        const now = Date.now();

        const serverElapsed = Math.max(
            0,
            Math.floor(
                (now - session.lastProgressAt) / 1000,
            ),
        );

        // Client cannot report more time than server elapsed.
        const validSeconds = isActive
            ? Math.min(
                activeSeconds,
                serverElapsed,
                this.MAX_PROGRESS_SECONDS,
            )
            : 0;

        session.lastProgressAt = now;
        session.activeSeconds += validSeconds;

        session.maxCompletionPercentage = Math.max(
            session.maxCompletionPercentage,
            completionPercentage,
        );

        const newSeconds =
            session.activeSeconds -
            session.persistedSeconds;

        let qualified = session.counted;

        if (
            !session.counted &&
            session.activeSeconds >= session.thresholdSeconds
        ) {
            await this.saveExploration(
                session,
                newSeconds,
                true,
            );

            session.counted = true;
            session.persistedSeconds = session.activeSeconds;
            qualified = true;
        } else if (
            session.counted &&
            newSeconds > 0
        ) {
            await this.saveExploration(
                session,
                newSeconds,
                false,
            );

            session.persistedSeconds = session.activeSeconds;
        }

        await this.redis.multi()
            .sadd(progressKey, progressId)
            .expire(progressKey, this.SESSION_TTL)
            .set(
                `learning:session:${sessionId}`,
                JSON.stringify(session),
                'EX',
                this.SESSION_TTL,
            )
            .exec();

        return {    
            success: true,
            duplicate: false,
            sessionId,
            validSeconds,
            totalSessionSeconds: session.activeSeconds,
            thresholdSeconds: session.thresholdSeconds,
            qualified,
            remainingSeconds: Math.max(
                0,
                session.thresholdSeconds -
                session.activeSeconds,
            ),
            explorationCounted: qualified,
        };
    }

    // =========================================
    // AWARD SKILL POINTS
    // =========================================

    private async awardSkillPoints(
        userId: number,
        postId: number,
    ) {
        // 1. Get user's onboarding skills
        const userSkills =
            await this.prisma.client.orm.public.UserSkill
                .where({ userId })
                .all();

        if (userSkills.length === 0) {
            return;
        }

        // 2. Get skills attached to this post
        const postSkills =
            await this.prisma.client.orm.public.PostSkill
                .where({ postId })
                .all();

        if (postSkills.length === 0) {
            return;
        }

        // 3. Find matching onboarding skills
        const postSkillIds = new Set(
            postSkills.map((item: any) =>
                Number(item.skillId),
            ),
        );

        const matchingSkillIds = [
            ...new Set(
                userSkills
                    .map((item: any) => Number(item.skillId))
                    .filter((skillId: number) =>
                        postSkillIds.has(skillId),
                    ),
            ),
        ];

        if (matchingSkillIds.length === 0) {
            return;
        }

        // 4. Add 0.5 points to every matching skill
        const now = Temporal.Now.instant();

        for (const skillId of matchingSkillIds) {
            const existingPoint =
                await this.prisma.client.orm.public.UserSkillPoint
                    .where({
                        userId,
                        skillId,
                    })
                    .first();

            if (!existingPoint) {
                await this.prisma.client.orm.public.UserSkillPoint.create({
                    userId,
                    skillId,
                    points: 0.5,
                    createdAt: now,
                    updatedAt: now,
                });
            } else {
                await this.prisma.client.orm.public.UserSkillPoint
                    .where({
                        userId,
                        skillId,
                    })
                    .update({
                        points:
                            Number(existingPoint.points) + 0.5,
                        updatedAt: now,
                    });
            }
        }
    }

    // =========================================
    // SAVE EXPLORATION IN DATABASE
    // =========================================

    private async saveExploration(
        session: LearningSession,
        secondsToAdd: number,
        newVisit: boolean,
    ) {
        const userId = session.userId;
        const postId = session.postId;

        const lockKey =
            `learning:lock:${userId}:${postId}`;

        const lockToken = randomUUID();

        const lockAcquired = await this.redis.set(
            lockKey,
            lockToken,
            'PX',
            10000,
            'NX',
        );

        if (lockAcquired !== 'OK') {
            throw new ConflictException(
                'Exploration is currently being updated. Retry shortly.',
            );
        }

        try {
            const existing =
                await this.prisma.client.orm.public.UserPostExploration
                    .where({
                        userId,
                        postId,
                    })
                    .first();

            // PostgreSQL DateTime fields require Temporal.Instant.
            const now = Temporal.Now.instant();

            if (!existing) {
                // First unique exploration record
                await this.prisma.client.orm.public.UserPostExploration.create({
                    userId,
                    postId,
                    contentType: session.contentType,
                    totalConsumptionSeconds: secondsToAdd,

                    maxCompletionPercentage:
                        session.maxCompletionPercentage,

                    explorationCount: 1,

                    firstExploredAt: now,
                    lastExploredAt: now,
                    createdAt: now,
                    updatedAt: now,
                });

                // Award points only for the first unique exploration
                await this.awardSkillPoints(
                    userId,
                    postId,
                );

            } else {
                await this.prisma.client.orm.public.UserPostExploration
                    .where({
                        userId,
                        postId,
                    })
                    .update({
                        totalConsumptionSeconds:
                            Number(existing.totalConsumptionSeconds) +
                            secondsToAdd,

                        maxCompletionPercentage: Math.max(
                            Number(existing.maxCompletionPercentage),
                            session.maxCompletionPercentage,
                        ),

                        explorationCount:
                            Number(existing.explorationCount) +
                            (newVisit ? 1 : 0),

                        lastExploredAt: newVisit
                            ? now
                            : existing.lastExploredAt,

                        updatedAt: now,
                    });
            }
        } finally {
            // Release only the lock owned by this request.
            await this.redis.eval(
                `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
                `,
                1,
                lockKey,
                lockToken,
            );
        }
    }

    // =========================================
    // END TRACKING
    // POST /v1/learning/track/end
    // =========================================

    async endTracking(
        userId: number,
        sessionId: string,
    ) {
        const session = await this.getSession(
            sessionId,
            userId,
        );

        session.ended = true;

        await this.redis.set(
            `learning:session:${sessionId}`,
            JSON.stringify(session),
            'EX',
            this.SESSION_TTL,
        );

        return {
            success: true,
            message: 'Learning tracking ended',
            sessionId,
            totalActiveSeconds: session.activeSeconds,
            explored: session.counted,
        };
    }


    // =========================================
    // OVERVIEW
    // GET /v1/learning/overview
    // =========================================

    async getOverview(
        userId: number,
        period: string = 'month',
    ) {
        if (
            period !== 'month' &&
            period !== 'all'
        ) {
            throw new BadRequestException(
                'period must be month or all',
            );
        }

        const records =
            await this.prisma.client.orm.public.UserPostExploration
                .where({
                    userId,
                })
                .all();

        const allTimeCount = records.length;

        if (period === 'all') {
            return {
                success: true,

                posts_explored: {
                    value: allTimeCount,
                    previous_period_value: null,
                    change_percentage: null,
                },

                period: 'all',
            };
        }

        const now = new Date();

        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth();

        const currentStart = new Date(
            Date.UTC(
                currentYear,
                currentMonth,
                1,
            ),
        );

        const nextStart = new Date(
            Date.UTC(
                currentYear,
                currentMonth + 1,
                1,
            ),
        );

        const previousStart = new Date(
            Date.UTC(
                currentYear,
                currentMonth - 1,
                1,
            ),
        );

        // Current month count
        const currentCount = records.filter(
            (record: any) => {
                const date = new Date(
                    record.firstExploredAt.epochMilliseconds,
                );

                return (
                    date >= currentStart &&
                    date < nextStart
                );
            },
        ).length;

        // Previous month count
        const previousCount = records.filter(
            (record: any) => {
                const date = new Date(
                    record.firstExploredAt.epochMilliseconds,
                );

                return (
                    date >= previousStart &&
                    date < currentStart
                );
            },
        ).length;

        const changePercentage =
            previousCount === 0
                ? null
                : Number(
                    (
                        (
                            (currentCount - previousCount) /
                            previousCount
                        ) * 100
                    ).toFixed(2),
                );

        return {
            success: true,

            posts_explored: {
                value: currentCount,
                previous_period_value: previousCount,
                change_percentage: changePercentage,
            },

            all_time_posts_explored: allTimeCount,

            period: {
                type: 'month',
                start: currentStart,
                end: nextStart,
                timezone: 'UTC',
            },
        };
    }

    // =========================================
    // TOTAL EXPLORATIONS (UNIQUE + REPEATED)
    // GET /v1/learning/total-explorations
    // =========================================

    async getTotalExplorations(userId: number) {
        if (!Number.isInteger(userId) || userId <= 0) {
            throw new BadRequestException('Invalid user ID');
        }

        const records =
            await this.prisma.client.orm.public.UserPostExploration
                .where({
                    userId,
                })
                .all();

        const uniquePostsExplored = records.length;

        const totalExplorations = records.reduce(
            (total: number, record: any) => {
                const count = Number(record.explorationCount ?? 0);

                return total + count;
            },
            0,
        );

        const repeatedExplorations =
            totalExplorations - uniquePostsExplored;

        return {
            success: true,
            message: 'Total explorations fetched successfully',

            total_explorations: totalExplorations,

            unique_posts_explored: uniquePostsExplored,

            repeated_explorations: repeatedExplorations,
        };
    }

    async getContentBreakdown(
        userId: number,
        period: 'day' | 'month' | 'all' = 'day',
    ) {
        const records =
            await this.prisma.client.orm.public.UserPostExploration
                .where({
                    userId,
                })
                .all();

        let filteredRecords = records;

        // =========================================
        // PERIOD FILTER
        // =========================================

        if (period === 'day' || period === 'month') {
            const now = new Date();

            let startDate: Date;
            let endDate: Date;

            if (period === 'day') {
                startDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate(),
                    ),
                );

                endDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate() + 1,
                    ),
                );
            } else {
                startDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        1,
                    ),
                );

                endDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth() + 1,
                        1,
                    ),
                );
            }

            filteredRecords = records.filter((record: any) => {
                const exploredDate = new Date(
                    record.firstExploredAt.epochMilliseconds,
                );

                return (
                    exploredDate >= startDate &&
                    exploredDate < endDate
                );
            });
        }

        // =========================================
        // CONTENT COUNTS
        // =========================================

        const counts = {
            IMAGE: 0,
            VIDEO: 0,
            DOCUMENT: 0,
            TEXT: 0,
        };

        for (const record of filteredRecords) {
            const contentType = record.contentType;

            if (contentType === 'LONG_FORM') {
                counts.DOCUMENT++;
            } else if (
                contentType === 'IMAGE' ||
                contentType === 'VIDEO' ||
                contentType === 'TEXT'
            ) {
                counts[contentType]++;
            }
        }

        // =========================================
        // PERCENTAGE CALCULATION
        // =========================================

        const totalPostsExplored = filteredRecords.length;

        const contentBreakdown = Object.entries(counts).map(
            ([type, count]) => ({
                type,
                count,
                percentage:
                    totalPostsExplored === 0
                        ? 0
                        : Number(
                            ((count / totalPostsExplored) * 100).toFixed(2),
                        ),
            }),
        );

        // =========================================
        // RESPONSE
        // =========================================

        return {
            success: true,
            total_posts_explored: totalPostsExplored,
            content_breakdown: contentBreakdown,
            period,
        };
    }

    // =========================================
    // SKILL INTEREST DISTRIBUTION
    // GET /v1/learning/skill-interest-distribution
    // =========================================

    async getSkillInterestDistribution(
        userId: number,
        period: 'day' | 'month' | 'all' = 'all',
    ) {
        // =========================================
        // FETCH USER EXPLORED POSTS
        // =========================================

        const explorationRecords =
            await this.prisma.client.orm.public.UserPostExploration
                .where({
                    userId,
                })
                .all();

        let filteredRecords = explorationRecords;

        // =========================================
        // PERIOD FILTER
        // =========================================

        if (period === 'day' || period === 'month') {
            const now = new Date();

            let startDate: Date;
            let endDate: Date;

            if (period === 'day') {
                startDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate(),
                    ),
                );

                endDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate() + 1,
                    ),
                );
            } else {
                startDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        1,
                    ),
                );

                endDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth() + 1,
                        1,
                    ),
                );
            }

            filteredRecords = explorationRecords.filter(
                (record: any) => {
                    const exploredDate = new Date(
                        record.firstExploredAt.epochMilliseconds,
                    );

                    return (
                        exploredDate >= startDate &&
                        exploredDate < endDate
                    );
                },
            );
        }

        // =========================================
        // UNIQUE EXPLORED POSTS
        // =========================================

        const exploredPostIds = [
            ...new Set(
                filteredRecords.map(
                    (record: any) => Number(record.postId),
                ),
            ),
        ];

        const totalPostsExplored = exploredPostIds.length;

        if (totalPostsExplored === 0) {
            return {
                success: true,
                total_posts_explored: 0,
                highlighted_skill: null,
                skill_distribution: [],
                period,
            };
        }

        // =========================================
        // FETCH POST SKILLS
        // =========================================

        const postSkills =
            await this.prisma.client.orm.public.PostSkill
                .where((item: any) =>
                    item.postId.in(exploredPostIds),
                )
                .all();

        // =========================================
        // FETCH SKILL DETAILS
        // =========================================

        const skillIds = [
            ...new Set(
                postSkills.map(
                    (item: any) => Number(item.skillId),
                ),
            ),
        ];

        const skills = skillIds.length > 0
            ? await this.prisma.client.orm.public.Skill
                .where((skill: any) =>
                    skill.id.in(skillIds),
                )
                .all()
            : [];

        // =========================================
        // COUNT POSTS PER SKILL
        // =========================================

        const skillPostMap = new Map<number, Set<number>>();

        for (const item of postSkills) {
            const skillId = Number(item.skillId);
            const postId = Number(item.postId);

            if (!skillPostMap.has(skillId)) {
                skillPostMap.set(
                    skillId,
                    new Set<number>(),
                );
            }

            skillPostMap.get(skillId)!.add(postId);
        }

        // =========================================
        // SKILL DISTRIBUTION
        // =========================================

        const skillDistribution = skills.map(
            (skill: any) => {
                const postCount =
                    skillPostMap.get(Number(skill.id))?.size ?? 0;

                return {
                    skillId: skill.id,
                    skillName: skill.name,
                    count: postCount,

                    percentage: Number(
                        (
                            (postCount / totalPostsExplored) *
                            100
                        ).toFixed(2),
                    ),
                };
            },
        );

        // =========================================
        // OTHER POSTS
        // Posts without any skill
        // =========================================

        const postsWithSkills = new Set(
            postSkills.map(
                (item: any) => Number(item.postId),
            ),
        );

        const otherCount = exploredPostIds.filter(
            (postId) => !postsWithSkills.has(postId),
        ).length;

        const otherPercentage = Number(
            (
                (otherCount / totalPostsExplored) *
                100
            ).toFixed(2),
        );

        // =========================================
        // ADD OTHER
        // =========================================

        skillDistribution.push({
            skillId: null,
            skillName: 'Other',
            count: otherCount,
            percentage: otherPercentage,
        });

        // =========================================
        // SORT BY PERCENTAGE
        // =========================================

        skillDistribution.sort(
            (a: any, b: any) =>
                b.percentage - a.percentage,
        );

        // =========================================
        // HIGHLIGHTED SKILL
        // =========================================

        const highlightedSkill =
            skillDistribution.find(
                (item: any) =>
                    item.skillName !== 'Other' &&
                    item.count > 0,
            ) ?? null;

        // =========================================
        // RESPONSE
        // =========================================

        return {
            success: true,

            total_posts_explored: totalPostsExplored,

            highlighted_skill: highlightedSkill
                ? {
                    skillId: highlightedSkill.skillId,
                    skillName: highlightedSkill.skillName,
                    count: highlightedSkill.count,
                    percentage: highlightedSkill.percentage,
                }
                : null,

            skill_distribution: skillDistribution,

            period,
        };
    }

    // =========================================
    // LEARNING STREAK
    // =========================================

    async getLearningStreak(userId: number) {

        const records =
            await this.prisma.client.orm.public.PostLearning
                .where({
                    userId,
                })
                .all();

        // Get unique learning dates (UTC)
        const learningDates = [
            ...new Set(
                records.map((record: any) =>
                    new Date(
                        record.createdAt.epochMilliseconds,
                    ).toISOString().slice(0, 10),
                ),
            ),
        ].sort().reverse();

        const today = new Date().toISOString().slice(0, 10);

        const yesterdayDate = new Date();
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);

        const yesterday = yesterdayDate.toISOString().slice(0, 10);

        // No learning records
        if (learningDates.length === 0) {
            return {
                success: true,
                currentStreak: 0,
                lastLearnedDate: null,
            };
        }

        const latestDate = learningDates[0];

        // Streak is active only if learned today or yesterday
        if (
            latestDate !== today &&
            latestDate !== yesterday
        ) {
            return {
                success: true,
                currentStreak: 0,
                lastLearnedDate: latestDate,
            };
        }

        let currentStreak = 0;

        let expectedDate = new Date(`${latestDate}T00:00:00.000Z`);

        for (const date of learningDates) {

            const expectedDateString =
                expectedDate.toISOString().slice(0, 10);

            if (date !== expectedDateString) {
                break;
            }

            currentStreak++;

            expectedDate.setUTCDate(
                expectedDate.getUTCDate() - 1,
            );
        }

        return {
            success: true,
            currentStreak,
            lastLearnedDate: latestDate,
        };
    }

}
