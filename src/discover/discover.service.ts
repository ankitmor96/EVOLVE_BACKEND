
import {
    Injectable,
    BadRequestException,
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

@Injectable()
export class DiscoverService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly connectionsService: ConnectionsService,
    ) { }

    // Stable hash for random ordering
    private generateHash(seed: string, postId: number): number {
        const value = `${seed}:${postId}`;

        let hash = 2166136261;

        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }

    // Encode cursor
    private encodeCursor(cursor: DiscoverCursor): string {
        return Buffer.from(JSON.stringify(cursor)).toString('base64url');
    }

    // Decode and validate cursor
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

    async getConnectionsPosts(
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
            throw new BadRequestException('Limit must be greater than zero');
        }

        // Maximum 50 posts per request
        limit = Math.min(limit, 50);

        // 3. Decode cursor or create new feed seed
        const paginationCursor = cursor
            ? this.decodeCursor(cursor)
            : null;

        const seed = paginationCursor?.seed ?? randomUUID();

        // 4. Get accepted connections
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

        // 5. Fetch eligible posts
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

        // 6. Generate stable random order
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

        // 7. Apply cursor
        const remainingPosts = paginationCursor
            ? randomizedPosts.filter((item) => {
                return (
                    item.hash > paginationCursor.lastHash ||
                    (
                        item.hash === paginationCursor.lastHash &&
                        Number(item.post.id) > paginationCursor.lastPostId
                    )
                );
            })
            : randomizedPosts;

        // 8. Fetch limit + 1 to check hasMore
        const selectedPosts = remainingPosts.slice(0, limit + 1);

        const hasMore = selectedPosts.length > limit;

        const pagePosts = selectedPosts.slice(0, limit);

        // 9. Generate next cursor
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

        // 10. Final response
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
}
