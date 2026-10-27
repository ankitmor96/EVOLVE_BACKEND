
import { Injectable, NotFoundException, } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }


    async getMyNotifications(userId: number) {
        const notifications =
            await this.prisma.client.orm.public.Notification
                .where({ userId })
                .all();

        return notifications.sort((a, b) => {
            const dateA = String(a.createdAt);
            const dateB = String(b.createdAt);

            return dateB.localeCompare(dateA);
        });
    }


    async markAsRead(userId: number, notificationId: number) {
        const notification =
            await this.prisma.client.orm.public.Notification
                .where({
                    id: notificationId,
                    userId,
                })
                .first();

        if (!notification) {
            throw new NotFoundException('Notification not found');
        }

        if (notification.isRead) {
            return {
                success: true,
                message: 'Notification is already read',
            };
        }

        await this.prisma.client.orm.public.Notification
            .where({
                id: notificationId,
                userId,
            })
            .update({
                isRead: true,
            });

        return {
            success: true,
            message: 'Notification marked as read',
        };
    }

    async createNotification(
        userId: number,
        type: 'CONNECTION_REQUEST' | 'CONNECTION_ACCEPTED',
        title: string,
        message: string,
    ) {
        const notification =
            await this.prisma.client.orm.public.Notification.create({
                userId,
                type,
                title,
                message,
            });

        this.notificationsGateway.emitNotification(
            userId,
            notification,
        );

        return notification;
    }

    async createPostNotification(
        userId: number,
        postId: number,
    ) {
        const notification =
            await this.prisma.client.orm.public.Notification.create({
                userId,
                type: 'POST_CREATED',
                title: 'New Post',
                message: `A connection has published a new post (ID: ${postId}).`,
            });

        this.notificationsGateway.emitNotification(
            userId,
            notification,
        );

        return notification;
    }

    async notifyAcceptedConnectionsAboutPost(
        authorId: number,
        postId: number,
    ) {
        const connections =
            await this.prisma.client.orm.public.Connection
                .where((connection) =>
                    connection.status.eq('ACCEPTED'),
                )
                .all();

        const connectedUserIds = [
            ...new Set(
                connections
                    .filter(
                        (connection) =>
                            connection.requesterId === authorId ||
                            connection.receiverId === authorId,
                    )
                    .map((connection) =>
                        connection.requesterId === authorId
                            ? connection.receiverId
                            : connection.requesterId,
                    ),
            ),
        ];

        for (const userId of connectedUserIds as number[]) {
            await this.createPostNotification(userId, postId);
        }
    }

    async createMessageNotification(
        receiverId: number,
        senderId: number,
        conversationId: number,
    ) {
        const sender = await this.prisma.client.orm.public.User
            .where({ id: senderId })
            .first();

        const senderName = sender?.name ?? 'Someone';

        const notification =
            await this.prisma.client.orm.public.Notification.create({
                userId: receiverId,
                type: 'MESSAGE_RECEIVED',
                title: 'New Message',
                message: `${senderName} sent you a message.`,
            });

        this.notificationsGateway.emitNotification(
            receiverId,
            notification,
        );

        return notification;
    }

    async createCommentNotification(
        postOwnerId: number,
        commenterId: number,
        postId: number,
    ) {
        const commenter = await this.prisma.client.orm.public.User
            .where({ id: commenterId })
            .first();

        const commenterName = commenter?.name ?? 'Someone';

        const notification =
            await this.prisma.client.orm.public.Notification.create({
                userId: postOwnerId,
                type: 'COMMENT_CREATED',
                title: 'New Comment',
                message: `${commenterName} commented on your post (ID: ${postId}).`,
            });

        this.notificationsGateway.emitNotification(
            postOwnerId,
            notification,
        );

        return notification;
    }

}
