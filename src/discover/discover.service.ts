
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
                .where({
                    userId: { in: connectionUserIds },
                })
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
            data: pagePosts.map((item) => item.post),
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

            data: pagePosts.map((item) => item.post),
        };
    }
}
