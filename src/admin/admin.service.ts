
import {
    Injectable,
    UnauthorizedException,
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

}
