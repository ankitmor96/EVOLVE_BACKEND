
import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { PrismaService } from '../prisma/prisma.service';
import { PostsGateway } from '../posts/posts.gateway';

@Injectable()
export class ConnectionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postsGateway: PostsGateway,
    ) { }

    // 1. Send connection request
    async sendRequest(requesterId: number, receiverId: number) {
        this.validateId(requesterId, 'requester ID');
        this.validateId(receiverId, 'receiver ID');

        if (requesterId === receiverId) {
            throw new BadRequestException(
                'You cannot send a connection request to yourself',
            );
        }

        const receiver = await this.prisma.client.orm.public.User
            .where({ id: receiverId })
            .first();

        if (!receiver) {
            throw new NotFoundException('Receiver user not found');
        }

        const existing = await this.prisma.client.orm.public.Connection
            .where({ requesterId, receiverId })
            .first();

        if (existing) {
            throw new ConflictException(
                `A connection request already exists with status ${existing.status}.`,
            );
        }

        const reverse = await this.prisma.client.orm.public.Connection
            .where({
                requesterId: receiverId,
                receiverId: requesterId,
            })
            .first();

        if (reverse?.status === 'ACCEPTED') {
            throw new ConflictException('You are already connected');
        }

        if (reverse?.status === 'PENDING') {
            throw new ConflictException(
                'This user has already sent you a connection request',
            );
        }

        if (reverse?.status === 'REJECTED') {
            throw new ConflictException(
                'A previous request was rejected by this user',
            );
        }

        const connection =
            await this.prisma.client.orm.public.Connection.create({
                requesterId,
                receiverId,
                status: 'PENDING',
                updatedAt: Temporal.Now.instant(),
            });

        this.postsGateway.emitConnectionRequested(receiverId, {
            connectionId: connection.id,
            requesterId,
            receiverId,
            status: connection.status,
            createdAt: connection.createdAt,
        });

        return {
            success: true,
            message: 'Connection request sent successfully',
            data: connection,
        };
    }

    // 2. Accept a received request
    async acceptRequest(userId: number, connectionId: number) {
        this.validateId(userId, 'user ID');
        this.validateId(connectionId, 'connection ID');

        const connection = await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .first();

        if (!connection) {
            throw new NotFoundException('Connection request not found');
        }

        if (connection.receiverId !== userId) {
            throw new ForbiddenException(
                'You can only accept requests sent to you',
            );
        }

        if (connection.status !== 'PENDING') {
            throw new ConflictException(
                `Cannot accept a request with status ${connection.status}`,
            );
        }

        const updated = await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .update({
                status: 'ACCEPTED',
                updatedAt: Temporal.Now.instant(),
            });

        if (!updated) {
            throw new NotFoundException(
                'Connection request could not be updated',
            );
        }

        this.postsGateway.emitConnectionAccepted(
            Number(connection.requesterId),
            {
                connectionId: updated.id,
                requesterId: Number(updated.requesterId),
                receiverId: Number(updated.receiverId),
                status: updated.status,
                updatedAt: updated.updatedAt,
            },
        );

        return {
            success: true,
            message: 'Connection request accepted successfully',
            data: updated,
        };
    }

    // 3. Reject a received request
    async rejectRequest(userId: number, connectionId: number) {
        this.validateId(userId, 'user ID');
        this.validateId(connectionId, 'connection ID');

        const connection = await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .first();

        if (!connection) {
            throw new NotFoundException('Connection request not found');
        }

        if (connection.receiverId !== userId) {
            throw new ForbiddenException(
                'You can only reject requests sent to you',
            );
        }

        if (connection.status !== 'PENDING') {
            throw new ConflictException(
                `Cannot reject a request with status ${connection.status}`,
            );
        }

        const updated = await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .update({
                status: 'REJECTED',
                updatedAt: Temporal.Now.instant(),
            });

        if (!updated) {
            throw new NotFoundException(
                'Connection request could not be updated',
            );
        }

        this.postsGateway.emitConnectionRejected(
            Number(connection.requesterId),
            {
                connectionId: updated.id,
                requesterId: Number(updated.requesterId),
                receiverId: Number(updated.receiverId),
                status: updated.status,
                updatedAt: updated.updatedAt,
            },
        );

        return {
            success: true,
            message: 'Connection request rejected successfully',
            data: updated,
        };
    }

    // 4. Get pending requests received by the logged-in user
    async getReceivedRequests(userId: number) {
        const requests = await this.prisma.client.orm.public.Connection
            .where({
                receiverId: userId,
                status: 'PENDING',
            })
            .orderBy((c) => c.createdAt.desc())
            .all();

        const data = await Promise.all(
            requests.map(async (request) => {
                const requesterId = Number(request.requesterId);

                const requester = await this.prisma.client.orm.public.User
                    .where({ id: requesterId })
                    .first();

                const profile = await this.prisma.client.orm.public.UserProfile
                    .where({ userId: requesterId })
                    .first();

                return {
                    ...request,
                    requester: {
                        id: requesterId,
                        name: requester?.name ?? null,
                        username: profile?.username ?? null,
                        avatarUrl: profile?.avatarUrl ?? null,
                    },
                };
            }),
        );

        return {
            success: true,
            count: data.length,
            data,
        };
    }

    // 5. Get pending requests sent by the logged-in user
    async getSentRequests(userId: number) {
        const requests = await this.prisma.client.orm.public.Connection
            .where({
                requesterId: userId,
                status: 'PENDING',
            })
            .orderBy((c) => c.createdAt.desc())
            .all();

        const data = await Promise.all(
            requests.map(async (request) => {
                const receiverId = Number(request.receiverId);

                const receiver = await this.prisma.client.orm.public.User
                    .where({ id: receiverId })
                    .first();

                const profile = await this.prisma.client.orm.public.UserProfile
                    .where({ userId: receiverId })
                    .first();

                return {
                    ...request,
                    receiver: {
                        id: receiverId,
                        name: receiver?.name ?? null,
                        username: profile?.username ?? null,
                        avatarUrl: profile?.avatarUrl ?? null,
                    },
                };
            }),
        );

        return {
            success: true,
            count: data.length,
            data,
        };
    }
    
    // 6. Get accepted connections
    async getMyConnections(userId: number) {
        const sentConnections =
            await this.prisma.client.orm.public.Connection
                .where({
                    requesterId: userId,
                    status: 'ACCEPTED',
                })
                .all();

        const receivedConnections =
            await this.prisma.client.orm.public.Connection
                .where({
                    receiverId: userId,
                    status: 'ACCEPTED',
                })
                .all();

        const connections = [
            ...sentConnections,
            ...receivedConnections,
        ];

        const data = await Promise.all(
            connections.map(async (connection) => {
                const isRequester =
                    Number(connection.requesterId) === userId;

                const otherUserId = isRequester
                    ? Number(connection.receiverId)
                    : Number(connection.requesterId);

                const otherUser =
                    await this.prisma.client.orm.public.User
                        .where({ id: otherUserId })
                        .first();

                const profile =
                    await this.prisma.client.orm.public.UserProfile
                        .where({ userId: otherUserId })
                        .first();

                return {
                    ...connection,
                    user: {
                        id: otherUserId,
                        name: otherUser?.name ?? null,
                        username: profile?.username ?? null,
                        avatarUrl: profile?.avatarUrl ?? null,
                    },
                };
            }),
        );

        return {
            success: true,
            count: data.length,
            data,
        };
    }

    // 7. Cancel pending request or remove accepted connection
    async removeConnection(userId: number, connectionId: number) {
        this.validateId(userId, 'user ID');
        this.validateId(connectionId, 'connection ID');

        const connection = await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .first();

        if (!connection) {
            throw new NotFoundException('Connection not found');
        }

        const isRequester = connection.requesterId === userId;
        const isReceiver = connection.receiverId === userId;

        if (!isRequester && !isReceiver) {
            throw new ForbiddenException(
                'You cannot remove another user’s connection',
            );
        }

        if (connection.status === 'PENDING' && !isRequester) {
            throw new ForbiddenException(
                'Only the requester can cancel a pending request',
            );
        }

        if (
            connection.status !== 'PENDING' &&
            connection.status !== 'ACCEPTED'
        ) {
            throw new ConflictException(
                `Cannot remove a connection with status ${connection.status}`,
            );
        }

        await this.prisma.client.orm.public.Connection
            .where({ id: connectionId })
            .delete();

        const otherUserId = Number(
            isRequester
                ? connection.receiverId
                : connection.requesterId,
        );

        this.postsGateway.emitConnectionRemoved(otherUserId, {
            connectionId: connection.id,
            requesterId: Number(connection.requesterId),
            receiverId: Number(connection.receiverId),
            previousStatus: connection.status,
            removedBy: userId,
        });

        return {
            success: true,
            message:
                connection.status === 'PENDING'
                    ? 'Connection request cancelled successfully'
                    : 'Connection removed successfully',
        };
    }

    // Shared ID validation
    private validateId(id: number, fieldName: string) {
        if (!Number.isInteger(id) || id <= 0) {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }
    }
}
