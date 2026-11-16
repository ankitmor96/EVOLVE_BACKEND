
import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { ConnectionsService } from '../connections/connections.service';

interface DiscoverCursor {
    version: 1;
    seed: string;
    lastHash: number;
    lastPostId: number;
}

interface SkillDiscoverCursor {
    version: 1;
    seed: string;
    skillId: number;
    lastHash: number;
    lastPostId: number;
}

@Injectable()
export class DiscoverService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly connectionsService: ConnectionsService,
    ) { }

    // =========================
    // HASH GENERATION
    // =========================

    private generateHash(seed: string, postId: number): number {
        const value = `${seed}:${postId}`;

        let hash = 2166136261;

        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }



    private async attachMediaToPosts(posts: any[]) {
        if (posts.length === 0) {
            return [];
        }

        const postIds = posts.map((post) => Number(post.id));

        const mediaList =
            await this.prisma.client.orm.public.PostMedia
                .where((media) => media.postId.in(postIds))
                .all();

        const mediaMap = new Map<number, any[]>();

        for (const media of mediaList) {
            const postId = Number(media.postId);

            if (!mediaMap.has(postId)) {
                mediaMap.set(postId, []);
            }

            mediaMap.get(postId)!.push(media);
        }

        return posts.map((post) => ({
            ...post,
            media: (mediaMap.get(Number(post.id)) ?? [])
                .sort(
                    (a, b) => Number(a.position) - Number(b.position),
                )
                .map((item) => ({
                    id: item.id,
                    mediaType: item.mediaType,
                    mediaUrl: item.mediaUrl,
                    thumbnailUrl: item.thumbnailUrl,
                    altText: item.altText,
                    position: item.position,
                })),
        }));
    }


    private async attachMediaUserAndReactions(posts: any[]) {
        if (posts.length === 0) {
            return [];
        }

        const postIds = posts.map((post) => Number(post.id));

        // 1. Fetch media
        const mediaList =
            await this.prisma.client.orm.public.PostMedia
                .where((media) => media.postId.in(postIds))
                .all();

        const mediaMap = new Map<number, any[]>();

        for (const media of mediaList) {
            const postId = Number(media.postId);

            if (!mediaMap.has(postId)) {
                mediaMap.set(postId, []);
            }

            mediaMap.get(postId)!.push(media);
        }

        // 2. Fetch post authors' usernames
        const userIds = [
            ...new Set(posts.map((post) => Number(post.userId))),
        ];

        const profiles =
            await this.prisma.client.orm.public.UserProfile
                .where((profile) => profile.userId.in(userIds))
                .all();

        const usernameMap = new Map<number, string>();

        for (const profile of profiles) {
            usernameMap.set(
                Number(profile.userId),
                String(profile.username),
            );
        }

        // 3. Fetch reactions
        const reactionList =
            await this.prisma.client.orm.public.PostReaction
                .where((reaction) => reaction.postId.in(postIds))
                .all();

        const reactionMap = new Map<number, any>();

        for (const reaction of reactionList) {
            const postId = Number(reaction.postId);

            if (!reactionMap.has(postId)) {
                reactionMap.set(postId, {
                    APPRECIATE: 0,
                    HELPFUL: 0,
                    LEARNED: 0,
                });
            }

            const counts = reactionMap.get(postId);

            const reactionType = String(reaction.reactionType);

            if (
                reactionType === 'APPRECIATE' ||
                reactionType === 'HELPFUL' ||
                reactionType === 'LEARNED'
            ) {
                counts[reactionType]++;
            }
        }

        // 4. Final response
        return posts.map((post) => {
            const postId = Number(post.id);
            const authorId = Number(post.userId);

            const counts = reactionMap.get(postId) ?? {};

            const reactions = Object.fromEntries(
                Object.entries(counts).filter(
                    ([, count]) => Number(count) > 0,
                ),
            );

            return {
                ...post,

                userName: usernameMap.get(authorId) ?? null,

                reactions,

                media: (mediaMap.get(postId) ?? [])
                    .sort(
                        (a, b) =>
                            Number(a.position) - Number(b.position),
                    )
                    .map((item) => ({
                        id: item.id,
                        mediaType: item.mediaType,
                        mediaUrl: item.mediaUrl,
                        thumbnailUrl: item.thumbnailUrl,
                        altText: item.altText,
                        position: item.position,
                    })),
            };
        });
    }



    // =========================
    // CONNECTION CURSOR
    // =========================

    private encodeCursor(cursor: DiscoverCursor): string {
        return Buffer.from(JSON.stringify(cursor)).toString('base64url');
    }

    private decodeCursor(cursor: string): DiscoverCursor {
        try {
            const decoded = JSON.parse(
                Buffer.from(cursor, 'base64url').toString('utf8'),
            );

            if (
                decoded.version !== 1 ||
                typeof decoded.seed !== 'string' ||
                !Number.isInteger(decoded.lastHash) ||
                !Number.isInteger(decoded.lastPostId) ||
                decoded.lastPostId <= 0
            ) {
                throw new Error('Invalid cursor structure');
            }

            return decoded as DiscoverCursor;
        } catch {
            throw new BadRequestException('Invalid pagination cursor');
        }
    }

    // =========================
    // SKILL CURSOR
    // =========================

    private encodeSkillCursor(
        cursor: SkillDiscoverCursor,
    ): string {
        return Buffer.from(JSON.stringify(cursor)).toString('base64url');
    }

    private decodeSkillCursor(
        cursor: string,
        requestedSkillId: number,
    ): SkillDiscoverCursor {
        try {
            const decoded = JSON.parse(
                Buffer.from(cursor, 'base64url').toString('utf8'),
            );

            if (
                decoded.version !== 1 ||
                typeof decoded.seed !== 'string' ||
                !Number.isInteger(decoded.skillId) ||
                decoded.skillId !== requestedSkillId ||
                !Number.isInteger(decoded.lastHash) ||
                !Number.isInteger(decoded.lastPostId) ||
                decoded.lastPostId <= 0
            ) {
                throw new Error('Invalid skill cursor');
            }

            return decoded as SkillDiscoverCursor;
        } catch {
            throw new BadRequestException(
                'Invalid pagination cursor for this skill',
            );
        }
    }

    // =========================
    // 1. CONNECTIONS POSTS
    // =========================

    async getConnectionsPosts(
        userId: number,
        limit = 10,
        cursor?: string,
    ) {
        if (!Number.isInteger(userId) || userId <= 0) {
            throw new BadRequestException('Invalid user ID');
        }

        if (!Number.isInteger(limit) || limit <= 0) {
            throw new BadRequestException(
                'Limit must be greater than zero',
            );
        }

        limit = Math.min(limit, 50);

        const paginationCursor = cursor
            ? this.decodeCursor(cursor)
            : null;

        const seed = paginationCursor?.seed ?? randomUUID();

        const connections =
            await this.connectionsService.getMyConnections(userId);

        const connectionUserIds = [
            ...new Set(
                connections.data.map(
                    (connection) => Number(connection.user.id),
                ),
            ),
        ];

        if (connectionUserIds.length === 0) {
            return {
                success: true,
                message: 'No accepted connections found',
                totalConnections: 0,
                totalPosts: 0,
                limit,
                hasMore: false,
                nextCursor: null,
                data: [],
            };
        }


        const posts =
            await this.prisma.client.orm.public.Post
                .where((post) => post.userId.in(connectionUserIds))
                .where((post) => post.status.eq('PUBLISHED'))
                .where((post) => post.moderation_status.eq('APPROVED'))
                .where((post) => post.deletedAt.isNull())
                .where((post) => post.visibility.neq('PRIVATE'))
                .all();


        const randomizedPosts = posts
            .map((post) => ({
                post,
                hash: this.generateHash(seed, Number(post.id)),
            }))
            .sort((a, b) => {
                if (a.hash !== b.hash) {
                    return a.hash - b.hash;
                }

                return Number(a.post.id) - Number(b.post.id);
            });

        const remainingPosts = paginationCursor
            ? randomizedPosts.filter((item) => {
                return (
                    item.hash > paginationCursor.lastHash ||
                    (
                        item.hash === paginationCursor.lastHash &&
                        Number(item.post.id) >
                        paginationCursor.lastPostId
                    )
                );
            })
            : randomizedPosts;

        const selectedPosts = remainingPosts.slice(0, limit + 1);

        const hasMore = selectedPosts.length > limit;
        const pagePosts = selectedPosts.slice(0, limit);

        let nextCursor: string | null = null;

        if (hasMore && pagePosts.length > 0) {
            const lastPost = pagePosts[pagePosts.length - 1];

            nextCursor = this.encodeCursor({
                version: 1,
                seed,
                lastHash: lastPost.hash,
                lastPostId: Number(lastPost.post.id),
            });
        }

        return {
            success: true,
            message: 'Connections posts fetched successfully',
            totalConnections: connectionUserIds.length,
            totalPosts: posts.length,
            limit,
            hasMore,
            nextCursor,
            data: await this.attachMediaUserAndReactions(
                pagePosts.map((item) => item.post),
            ),
        };
    }

    // =========================
    // 2. SKILL BASED POSTS
    // =========================

    async getSkillPosts(
        userId: number,
        skillId: number,
        limit = 10,
        cursor?: string,
    ) {
        // 1. Validate user ID
        if (!Number.isInteger(userId) || userId <= 0) {
            throw new BadRequestException('Invalid user ID');
        }

        // 2. Validate skill ID
        if (!Number.isInteger(skillId) || skillId <= 0) {
            throw new BadRequestException('Invalid skill ID');
        }

        // 3. Validate limit
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new BadRequestException(
                'Limit must be greater than zero',
            );
        }

        limit = Math.min(limit, 50);

        // 4. Validate selected skill exists
        const skill =
            await this.prisma.client.orm.public.Skill
                .where({ id: skillId })
                .first();

        if (!skill) {
            throw new NotFoundException('Selected skill not found');
        }

        // 5. Decode cursor or generate new seed
        const paginationCursor = cursor
            ? this.decodeSkillCursor(cursor, skillId)
            : null;

        const seed = paginationCursor?.seed ?? randomUUID();

        // 6. Find all posts connected to selected skill
        const postSkills =
            await this.prisma.client.orm.public.PostSkill
                .where({ skillId })
                .all();

        const postIds = [
            ...new Set(
                postSkills.map((item) => Number(item.postId)),
            ),
        ];

        if (postIds.length === 0) {
            return {
                success: true,
                message: 'No posts found for this skill',
                skillId,
                totalPosts: 0,
                limit,
                hasMore: false,
                nextCursor: null,
                data: [],
            };
        }

        // 7. Get accepted connections
        const connections =
            await this.connectionsService.getMyConnections(userId);

        const connectionUserIds = new Set<number>(
            connections.data.map(
                (connection) => Number(connection.user.id),
            ),
        );

        // 8. Fetch matching posts
        const allPosts = await this.prisma.client.orm.public.Post
            .where(post => post.id.in(postIds))
            .where(post => post.status.eq('PUBLISHED'))
            .where(post => post.moderation_status.eq('APPROVED'))
            .where(post => post.deletedAt.isNull())
            .all();

        // 9. Apply visibility permissions
        const posts = allPosts.filter((post) => {
            const authorId = Number(post.userId);

            if (post.visibility === 'PUBLIC') {
                return true;
            }

            if (post.visibility === 'CONNECTIONS') {
                return (
                    authorId === userId ||
                    connectionUserIds.has(authorId)
                );
            }

            // PRIVATE posts are not included
            return false;
        });

        // 10. Generate stable random ordering
        const randomizedPosts = posts
            .map((post) => ({
                post,
                hash: this.generateHash(seed, Number(post.id)),
            }))
            .sort((a, b) => {
                if (a.hash !== b.hash) {
                    return a.hash - b.hash;
                }

                return Number(a.post.id) - Number(b.post.id);
            });

        // 11. Apply cursor pagination
        const remainingPosts = paginationCursor
            ? randomizedPosts.filter((item) => {
                return (
                    item.hash > paginationCursor.lastHash ||
                    (
                        item.hash === paginationCursor.lastHash &&
                        Number(item.post.id) >
                        paginationCursor.lastPostId
                    )
                );
            })
            : randomizedPosts;

        // 12. Fetch limit + 1
        const selectedPosts = remainingPosts.slice(0, limit + 1);

        const hasMore = selectedPosts.length > limit;

        const pagePosts = selectedPosts.slice(0, limit);

        // 13. Generate next cursor
        let nextCursor: string | null = null;

        if (hasMore && pagePosts.length > 0) {
            const lastPost = pagePosts[pagePosts.length - 1];

            nextCursor = this.encodeSkillCursor({
                version: 1,
                seed,
                skillId,
                lastHash: lastPost.hash,
                lastPostId: Number(lastPost.post.id),
            });
        }

        // 14. Final response
        return {
            success: true,
            message: 'Skill posts fetched successfully',

            skillId,
            totalPosts: posts.length,

            limit,
            hasMore,
            nextCursor,

            data: await this.attachMediaUserAndReactions(
                pagePosts.map((item) => item.post),
            ),
        };
    }

    // =========================
    // 3. CURIOSITY BASED POSTS
    // =========================

    async getCuriosityPosts(
        userId: number,
        limit = 10,
        cursor?: string,
    ) {
        // 1. Validate user ID
        if (!Number.isInteger(userId) || userId <= 0) {
            throw new BadRequestException('Invalid user ID');
        }

        // 2. Validate limit
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new BadRequestException(
                'Limit must be greater than zero',
            );
        }

        limit = Math.min(limit, 50);

        // 3. Get user's selected curiosities
        const curiosities =
            await this.prisma.client.orm.public.UserCuriosity
                .where({ userId })
                .all();

        const skillIds = [
            ...new Set(
                curiosities.map((item) => Number(item.skillId)),
            ),
        ];

        if (skillIds.length === 0) {
            return {
                success: true,
                message: 'No selected curiosities found',
                totalCuriosities: 0,
                totalPosts: 0,
                limit,
                hasMore: false,
                nextCursor: null,
                data: [],
            };
        }

        // 4. Decode cursor or generate new seed
        const paginationCursor = cursor
            ? this.decodeCursor(cursor)
            : null;

        const seed = paginationCursor?.seed ?? randomUUID();

        // 5. Find all posts connected to selected curiosities
        const postSkills =
            await this.prisma.client.orm.public.PostSkill
                .where((item) => item.skillId.in(skillIds))
                .all();

        const postIds = [
            ...new Set(
                postSkills.map((item) => Number(item.postId)),
            ),
        ];

        if (postIds.length === 0) {
            return {
                success: true,
                message: 'No posts found for selected curiosities',
                totalCuriosities: skillIds.length,
                totalPosts: 0,
                limit,
                hasMore: false,
                nextCursor: null,
                data: [],
            };
        }

        // 6. Get accepted connections
        const connections =
            await this.connectionsService.getMyConnections(userId);

        const connectionUserIds = new Set<number>(
            connections.data.map(
                (connection) => Number(connection.user.id),
            ),
        );

        // 7. Fetch matching posts
        const allPosts =
            await this.prisma.client.orm.public.Post
                .where((post) => post.id.in(postIds))
                .where((post) => post.status.eq('PUBLISHED'))
                .where((post) => post.moderation_status.eq('APPROVED'))
                .where((post) => post.deletedAt.isNull())
                .all();

        // 8. Apply visibility permissions
        const posts = allPosts.filter((post) => {
            const authorId = Number(post.userId);

            if (post.visibility === 'PUBLIC') {
                return true;
            }

            if (post.visibility === 'CONNECTIONS') {
                return (
                    authorId === userId ||
                    connectionUserIds.has(authorId)
                );
            }

            // PRIVATE posts are not included
            return false;
        });

        // 9. Generate stable random ordering
        const randomizedPosts = posts
            .map((post) => ({
                post,
                hash: this.generateHash(seed, Number(post.id)),
            }))
            .sort((a, b) => {
                if (a.hash !== b.hash) {
                    return a.hash - b.hash;
                }

                return Number(a.post.id) - Number(b.post.id);
            });

        // 10. Apply cursor pagination
        const remainingPosts = paginationCursor
            ? randomizedPosts.filter((item) => {
                return (
                    item.hash > paginationCursor.lastHash ||
                    (
                        item.hash === paginationCursor.lastHash &&
                        Number(item.post.id) >
                        paginationCursor.lastPostId
                    )
                );
            })
            : randomizedPosts;

        // 11. Fetch limit + 1
        const selectedPosts = remainingPosts.slice(0, limit + 1);

        const hasMore = selectedPosts.length > limit;

        const pagePosts = selectedPosts.slice(0, limit);

        // 12. Generate next cursor
        let nextCursor: string | null = null;

        if (hasMore && pagePosts.length > 0) {
            const lastPost = pagePosts[pagePosts.length - 1];

            nextCursor = this.encodeCursor({
                version: 1,
                seed,
                lastHash: lastPost.hash,
                lastPostId: Number(lastPost.post.id),
            });
        }

        // 13. Final response
        return {
            success: true,
            message: 'Curiosity posts fetched successfully',

            totalCuriosities: skillIds.length,
            totalPosts: posts.length,

            limit,
            hasMore,
            nextCursor,

            data: await this.attachMediaUserAndReactions(
                pagePosts.map((item) => item.post),
            ),
        };
    }

    // =========================
    // 4. SKILL POST COUNTS
    // =========================

    async getSkillPostCounts(userId: number) {

        // 1. Validate user ID
        if (!Number.isInteger(userId) || userId <= 0) {
            throw new BadRequestException('Invalid user ID');
        }

        // 2. Get all available skills
        const skills =
            await this.prisma.client.orm.public.Skill
                .all();

        const skillIds = skills.map(
            (skill) => Number(skill.id),
        );

        // 3. Get posts connected to all skills
        const postSkills = skillIds.length > 0
            ? await this.prisma.client.orm.public.PostSkill
                .where((item) => item.skillId.in(skillIds))
                .all()
            : [];

        // 4. Get unique post IDs
        const postIds = [
            ...new Set(
                postSkills.map((item) => Number(item.postId)),
            ),
        ];

        // 5. Get accepted connections
        const connections =
            await this.connectionsService.getMyConnections(userId);

        const connectionUserIds = new Set<number>(
            connections.data.map(
                (connection) => Number(connection.user.id),
            ),
        );

        // 6. Fetch eligible posts
        const allPosts = postIds.length > 0
            ? await this.prisma.client.orm.public.Post
                .where((post) => post.id.in(postIds))
                .where((post) => post.status.eq('PUBLISHED'))
                .where((post) => post.moderation_status.eq('APPROVED'))
                .where((post) => post.deletedAt.isNull())
                .all()
            : [];

        // 7. Apply visibility permissions
        const eligiblePosts = allPosts.filter((post) => {
            const authorId = Number(post.userId);

            if (post.visibility === 'PUBLIC') {
                return true;
            }

            if (post.visibility === 'CONNECTIONS') {
                return (
                    authorId === userId ||
                    connectionUserIds.has(authorId)
                );
            }

            return false;
        });

        // 8. Create eligible post ID set
        const eligiblePostIds = new Set(
            eligiblePosts.map((post) => Number(post.id)),
        );

        // 9. Count posts for each available skill
        const data = skills.map((skill) => {

            const uniqueSkillPostIds = new Set(
                postSkills
                    .filter(
                        (item) => Number(item.skillId) === Number(skill.id),
                    )
                    .map((item) => Number(item.postId))
                    .filter((postId) => eligiblePostIds.has(postId)),
            );

            return {
                skillId: skill.id,
                skillName: skill.name,
                postCount: uniqueSkillPostIds.size,
            };
        });

        // 10. Final response
        return {
            success: true,
            message: 'Skill post counts fetched successfully',
            totalSkills: skills.length,
            data,
        };
    }


    async getUserSuggestions(currentUserId: number) {
        // 1. Fetch all posts
        const allPosts =
            await this.prisma.client.orm.public.Post.all();

        // Only published, approved and non-deleted posts
        const eligiblePosts = allPosts.filter(
            (post) =>
                String(post.status) === 'PUBLISHED' &&
                String(post.moderation_status) === 'APPROVED' &&
                post.deletedAt === null,
        );

        // 2. Group posts by user
        const userPostMap = new Map<number, any[]>();

        for (const post of eligiblePosts) {
            const userId = Number(post.userId);

            // Exclude logged-in user
            if (userId === currentUserId) {
                continue;
            }

            if (!userPostMap.has(userId)) {
                userPostMap.set(userId, []);
            }

            userPostMap.get(userId)!.push(post);
        }

        const userIds = [...userPostMap.keys()];

        if (userIds.length === 0) {
            return {
                success: true,
                message: 'User suggestions fetched successfully',
                totalUsers: 0,
                data: [],
            };
        }

        // 3. Fetch user profiles
        const profiles =
            await this.prisma.client.orm.public.UserProfile
                .where((profile) => profile.userId.in(userIds))
                .all();

        const profileMap = new Map<number, any>();

        for (const profile of profiles) {
            profileMap.set(Number(profile.userId), profile);
        }

        // 4. Fetch selected user identities
        const identities =
            await this.prisma.client.orm.public.UserIdentity
                .where((identity) => identity.userId.in(userIds))
                .all();

        // 5. Fetch identity type IDs
        const identityTypeIds = [
            ...new Set(
                identities.map((identity) =>
                    Number(identity.identityTypeId),
                ),
            ),
        ];

        // 6. Fetch identity names and slugs
        const identityTypes =
            identityTypeIds.length > 0
                ? await this.prisma.client.orm.public.IdentityType
                    .where((identityType) =>
                        identityType.id.in(identityTypeIds),
                    )
                    .all()
                : [];

        const identityTypeMap = new Map<number, any>();

        for (const identityType of identityTypes) {
            identityTypeMap.set(
                Number(identityType.id),
                identityType,
            );
        }

        // 7. Get all eligible post IDs
        const postIds = eligiblePosts
            .filter((post) =>
                userIds.includes(Number(post.userId)),
            )
            .map((post) => Number(post.id));

        // Map postId -> owner userId
        const postOwnerMap = new Map<number, number>();

        for (const post of eligiblePosts) {
            const userId = Number(post.userId);

            if (userIds.includes(userId)) {
                postOwnerMap.set(Number(post.id), userId);
            }
        }

        // 8. Fetch reactions
        const reactions =
            await this.prisma.client.orm.public.PostReaction
                .where((reaction) => reaction.postId.in(postIds))
                .all();

        // 9. Fetch learning records
        const learningRecords =
            await this.prisma.client.orm.public.PostLearning
                .where((learning) => learning.postId.in(postIds))
                .all();

        // 10. Initialize ranking for every user
        const rankingMap = new Map<number, any>();

        for (const userId of userIds) {
            rankingMap.set(userId, {
                APPRECIATE: 0,
                HELPFUL: 0,
                LEARNED: 0,
                total: 0,
            });
        }

        // 11. Count APPRECIATE and HELPFUL
        for (const reaction of reactions) {
            const ownerId = postOwnerMap.get(
                Number(reaction.postId),
            );

            if (ownerId === undefined) {
                continue;
            }

            const reactionType = String(reaction.reactionType);
            const ranking = rankingMap.get(ownerId);

            if (
                reactionType === 'APPRECIATE' ||
                reactionType === 'HELPFUL'
            ) {
                ranking[reactionType]++;
            }
        }

        // 12. Count LEARNED from PostLearning
        for (const learning of learningRecords) {
            const ownerId = postOwnerMap.get(
                Number(learning.postId),
            );

            if (ownerId === undefined) {
                continue;
            }

            rankingMap.get(ownerId).LEARNED++;
        }

        // 13. Calculate total reaction ranking
        for (const ranking of rankingMap.values()) {
            ranking.total =
                ranking.APPRECIATE +
                ranking.HELPFUL +
                ranking.LEARNED;
        }

        // 14. Prepare user suggestions
        const suggestions = userIds.map((userId) => {
            const profile = profileMap.get(userId);

            // Get all selected identities of this user
            const userIdentities = identities
                .filter(
                    (identity) =>
                        Number(identity.userId) === userId,
                )
                .map((identity) => {
                    const identityType =
                        identityTypeMap.get(
                            Number(identity.identityTypeId),
                        );

                    return {
                        name: identityType?.name ?? null,
                        slug: identityType?.slug ?? null,
                        isPrimary: identity.isPrimary,
                    };
                });

            return {
                userId,

                userName: profile?.username
                    ? String(profile.username)
                    : null,

                totalPostCount:
                    userPostMap.get(userId)?.length ?? 0,

                identity: userIdentities,

                reactionRanking: rankingMap.get(userId),
            };
        });

        // 15. Sort by highest reaction ranking
        suggestions.sort((a, b) => {
            // First priority: total reaction ranking
            const rankingDifference =
                b.reactionRanking.total -
                a.reactionRanking.total;

            if (rankingDifference !== 0) {
                return rankingDifference;
            }

            // Second priority: total post count
            return b.totalPostCount - a.totalPostCount;
        });

        // 16. Final response
        return {
            success: true,
            message: 'User suggestions fetched successfully',
            totalUsers: suggestions.length,
            data: suggestions,
        };
    }

}
