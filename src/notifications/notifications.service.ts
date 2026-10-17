
import { Injectable, NotFoundException, } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
    constructor(private readonly prisma: PrismaService) { }

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

}
