
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

        return notifications
            .filter(
                (notification) =>
                    notification.type === 'CONNECTION_REQUEST' ||
                    notification.type === 'CONNECTION_ACCEPTED',
            )
            .sort((a, b) => {
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

}
