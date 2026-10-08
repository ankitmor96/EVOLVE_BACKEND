import {
    ConflictException,
    Injectable,
     NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateIdentityTypeDto } from './dto/create-identity-type.dto';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    async createIdentityType(dto: CreateIdentityTypeDto) {
        const existing =
            await this.prisma.client.orm.public.IdentityType
                .where({ slug: dto.slug })
                .first();

        if (existing) {
            throw new ConflictException(
                'Identity type with this slug already exists',
            );
        }

        return this.prisma.client.orm.public.IdentityType.create({
            name: dto.name,
            slug: dto.slug,
            isActive: true,
        });
    }

    async getIdentityTypes() {
        return this.prisma.client.orm.public.IdentityType
            .where({})
            .all();
    }

    async disableIdentityType(id: number) {
        const identityType =
            await this.prisma.client.orm.public.IdentityType
                .where({ id })
                .first();

        if (!identityType) {
            throw new NotFoundException('Identity type not found');
        }

        return this.prisma.client.orm.public.IdentityType
            .where({ id })
            .update({
                isActive: false,
            });
    }
}