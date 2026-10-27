
import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Temporal } from '@js-temporal/polyfill';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ) { }

    private async getConnectionStatus(
        userA: number,
        userB: number,
    ): Promise<boolean> {
        const [forward, backward] = await Promise.all([
            this.prisma.client.orm.public.Connection
                .where({
                    requesterId: userA,
                    receiverId: userB,
                    status: 'ACCEPTED',
                })
                .first(),

            this.prisma.client.orm.public.Connection
                .where({
                    requesterId: userB,
                    receiverId: userA,
                    status: 'ACCEPTED',
                })
                .first(),
        ]);

        return Boolean(forward || backward);
    }

    private async getParticipant(
        conversationId: number,
        userId: number,
    ) {
        return this.prisma.client.orm.public.ConversationParticipant
            .where({ conversationId, userId })
            .first();
    }

    private async ensureParticipant(
        conversationId: number,
        userId: number,
    ) {
        const participant = await this.getParticipant(
            conversationId,
            userId,
        );

        if (!participant) {
            throw new ForbiddenException(
                'You are not a participant of this conversation',
            );
        }

        return participant;
    }

    private async getConversationParticipants(
        conversationId: number,
    ) {
        return this.prisma.client.orm.public.ConversationParticipant
            .where({ conversationId })
            .all();
    }

    // 1. Search accepted connections
    async searchConnections(
        currentUserId: number,
        search: string,
    ) {
        const term = String(search ?? '').trim().toLowerCase();
        const normalizedTerm = term.startsWith('@')
            ? term.slice(1)
            : term;

        if (!normalizedTerm) {
            throw new BadRequestException(
                'Search query is required',
            );
        }

        const [sent, received] = await Promise.all([
            this.prisma.client.orm.public.Connection
                .where({
                    requesterId: currentUserId,
                    status: 'ACCEPTED',
                })
                .all(),

            this.prisma.client.orm.public.Connection
                .where({
                    receiverId: currentUserId,
                    status: 'ACCEPTED',
                })
                .all(),
        ]);

        const ids = new Set<number>();

        for (const connection of sent) {
            ids.add(Number(connection.receiverId));
        }

        for (const connection of received) {
            ids.add(Number(connection.requesterId));
        }

        ids.delete(currentUserId);

        const data = [];

        for (const userId of ids) {
            const user = await this.prisma.client.orm.public.User
                .where({ id: userId })
                .first();

            if (!user) continue;

            const profile =
                await this.prisma.client.orm.public.UserProfile
                    .where({ userId })
                    .first();

            if (!profile) continue;

            const name = String(user.name ?? '');
            const email = String(user.email ?? '');
            const username = String(profile.username ?? '');

            const matches =
                name.toLowerCase().includes(normalizedTerm) ||
                email.toLowerCase().includes(normalizedTerm) ||
                username.toLowerCase().includes(normalizedTerm);

            if (!matches) continue;

            data.push({
                userId,
                name,
                username,
                avatarUrl: profile.avatarUrl ?? null,
            });
        }

        data.sort((a, b) => a.name.localeCompare(b.name));

        return {
            success: true,
            count: data.length,
            data,
        };
    }

    // 2. Get my conversations
    async getConversations(currentUserId: number) {
        const myParticipants =
            await this.prisma.client.orm.public.ConversationParticipant
                .where({ userId: currentUserId })
                .all();

        const data = [];

        for (const participant of myParticipants) {
            const conversationId = Number(participant.conversationId);

            const conversation =
                await this.prisma.client.orm.public.Conversation
                    .where({ id: conversationId })
                    .first();

            if (!conversation) continue;

            const participants =
                await this.getConversationParticipants(conversationId);

            const otherParticipants = participants.filter(
                (p) => Number(p.userId) !== currentUserId,
            );

            const otherUsers = [];

            for (const p of otherParticipants) {
                const userId = Number(p.userId);

                const user = await this.prisma.client.orm.public.User
                    .where({ id: userId })
                    .first();

                const profile =
                    await this.prisma.client.orm.public.UserProfile
                        .where({ userId })
                        .first();

                if (user) {
                    otherUsers.push({
                        userId,
                        name: user.name,
                        username: profile?.username ?? null,
                        avatarUrl: profile?.avatarUrl ?? null,
                    });
                }
            }

            const allMessages =
                await this.prisma.client.orm.public.Message
                    .where({ conversationId })
                    .all();

            const messages = allMessages
                .filter((m) => !m.deletedAt)
                .sort(
                    (a, b) =>
                        new Date(String(b.createdAt)).getTime() -
                        new Date(String(a.createdAt)).getTime()
                );

            const unreadCount = messages.filter(
                (m) =>
                    Number(m.senderId) !== currentUserId &&
                    !m.isRead,
            ).length;

            data.push({
                conversationId,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                participants: otherUsers,
                lastMessage: messages[0] ?? null,
                unreadCount,
            });
        }

        data.sort(
            (a, b) =>
                new Date(String(b.updatedAt)).getTime() -
                new Date(String(a.updatedAt)).getTime()
        );

        return {
            success: true,
            count: data.length,
            data,
        };
    }

    // 3. Start a conversation or return existing one
    async startConversation(
        currentUserId: number,
        receiverId: number,
    ) {
        if (
            !Number.isInteger(receiverId) ||
            receiverId <= 0 ||
            receiverId === currentUserId
        ) {
            throw new BadRequestException(
                'A valid receiver ID is required',
            );
        }

        const isConnected = await this.getConnectionStatus(
            currentUserId,
            receiverId,
        );

        if (!isConnected) {
            throw new ForbiddenException(
                'You can message accepted connections only',
            );
        }

        const receiver = await this.prisma.client.orm.public.User
            .where({ id: receiverId })
            .first();

        if (!receiver) {
            throw new NotFoundException('Receiver not found');
        }

        const myParticipants =
            await this.prisma.client.orm.public.ConversationParticipant
                .where({ userId: currentUserId })
                .all();

        for (const participant of myParticipants) {
            const conversationId = Number(participant.conversationId);

            const participants =
                await this.getConversationParticipants(conversationId);

            if (
                participants.length === 2 &&
                participants.some(
                    (p) => Number(p.userId) === receiverId,
                )
            ) {
                const conversation =
                    await this.prisma.client.orm.public.Conversation
                        .where({ id: conversationId })
                        .first();

                if (conversation) {
                    return {
                        success: true,
                        message: 'Conversation already exists',
                        created: false,
                        data: conversation,
                    };
                }
            }
        }

        const conversation =
            await this.prisma.client.orm.public.Conversation.create({});

        await this.prisma.client.orm.public.ConversationParticipant
            .create({
                conversationId: conversation.id,
                userId: currentUserId,
            });

        await this.prisma.client.orm.public.ConversationParticipant
            .create({
                conversationId: conversation.id,
                userId: receiverId,
            });

        return {
            success: true,
            message: 'Conversation created successfully',
            created: true,
            data: conversation,
        };
    }

    // 4. Get conversation details
    async getConversation(
        currentUserId: number,
        conversationId: number,
    ) {
        await this.ensureParticipant(
            conversationId,
            currentUserId,
        );

        const conversation =
            await this.prisma.client.orm.public.Conversation
                .where({ id: conversationId })
                .first();

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        const participants =
            await this.getConversationParticipants(conversationId);

        const data = [];

        for (const participant of participants) {
            const userId = Number(participant.userId);

            const user = await this.prisma.client.orm.public.User
                .where({ id: userId })
                .first();

            const profile =
                await this.prisma.client.orm.public.UserProfile
                    .where({ userId })
                    .first();

            if (user) {
                data.push({
                    userId,
                    name: user.name,
                    email: user.email,
                    username: profile?.username ?? null,
                    avatarUrl: profile?.avatarUrl ?? null,
                    joinedAt: participant.joinedAt,
                });
            }
        }

        return {
            success: true,
            data: {
                ...conversation,
                participants: data,
            },
        };
    }

    // 5. Get conversation messages
    async getMessages(
        currentUserId: number,
        conversationId: number,
        limit = 50,
        offset = 0,
    ) {
        await this.ensureParticipant(
            conversationId,
            currentUserId,
        );

        const conversation =
            await this.prisma.client.orm.public.Conversation
                .where({ id: conversationId })
                .first();

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        const allMessages =
            await this.prisma.client.orm.public.Message
                .where({ conversationId })
                .all();

        const filtered = allMessages
            .filter((m) => !m.deletedAt)
            .sort(
                (a, b) =>
                    new Date(String(a.createdAt)).getTime() -
                    new Date(String(b.createdAt)).getTime()
            );

        const safeOffset = Math.max(0, offset);
        const safeLimit = Math.min(Math.max(1, limit), 100);
        const messages = filtered.slice(
            safeOffset,
            safeOffset + safeLimit,
        );

        return {
            success: true,
            count: filtered.length,
            limit: safeLimit,
            offset: safeOffset,
            data: messages,
        };
    }

    // 6. Send a message
    async sendMessage(
        currentUserId: number,
        conversationId: number,
        content: string,
    ) {
        await this.ensureParticipant(
            conversationId,
            currentUserId,
        );

        const text = String(content ?? '').trim();

        if (!text) {
            throw new BadRequestException(
                'Message content is required',
            );
        }

        if (text.length > 5000) {
            throw new BadRequestException(
                'Message cannot exceed 5000 characters',
            );
        }

        const message =
            await this.prisma.client.orm.public.Message.create({
                conversationId,
                senderId: currentUserId,
                content: text,
            });

        await this.prisma.client.orm.public.Conversation
            .where({ id: conversationId })
            .update({
                updatedAt: Temporal.Now.instant(),
            });


        const participants =
            await this.getConversationParticipants(conversationId);

        const receiver = participants.find(
            (participant) => Number(participant.userId) !== currentUserId,
        );

        if (receiver) {
            await this.notificationsService.createMessageNotification(
                Number(receiver.userId),
                currentUserId,
                conversationId,
            );
        }


        return {
            success: true,
            message: 'Message sent successfully',
            data: message,
        };
    }

    // 7. Mark incoming messages as read
    async markMessagesRead(
        currentUserId: number,
        conversationId: number,
    ) {
        await this.ensureParticipant(
            conversationId,
            currentUserId,
        );

        const allMessages =
            await this.prisma.client.orm.public.Message
                .where({ conversationId })
                .all();

        let updatedCount = 0;

        for (const message of allMessages) {
            if (
                Number(message.senderId) !== currentUserId &&
                !message.isRead &&
                !message.deletedAt
            ) {
                await this.prisma.client.orm.public.Message
                    .where({ id: message.id })
                    .update({ isRead: true });

                updatedCount++;
            }
        }

        return {
            success: true,
            message: 'Messages marked as read',
            updatedCount,
        };
    }
}
