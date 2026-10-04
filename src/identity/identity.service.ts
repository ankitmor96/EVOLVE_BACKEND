import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { UpdateUserIdentityDto } from './dto/update-user-identity.dto';

@Injectable()
export class IdentityService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }


    // =====================================
    // GET ALL IDENTITY TYPES
    // =====================================

    async getIdentityTypes() {
        return this.prisma.client.orm.public.IdentityType
            .where({
                isActive: true,
            })
            .all();
    }


    // =====================================
    // CREATE USER IDENTITIES
    // =====================================

    async createUserIdentities(
        userId: number,
        identityTypeIds: number[],
        primaryIdentityTypeId?: number,
    ) {
        const identities = [];

        for (const identityTypeId of identityTypeIds) {

            // Check IdentityType exists
            const identityType =
                await this.prisma.client.orm.public.IdentityType
                    .where({
                        id: identityTypeId,
                        isActive: true,
                    })
                    .first();

            if (!identityType) {
                throw new Error(
                    `Identity type ${identityTypeId} not found`,
                );
            }

            // Check if user already has this identity
            const existingIdentity =
                await this.prisma.client.orm.public.UserIdentity
                    .where({
                        userId,
                        identityTypeId,
                    })
                    .first();

            let identity;

            if (existingIdentity) {
                // Already exists → update primary status
                identity =
                    await this.prisma.client.orm.public.UserIdentity
                        .where({
                            id: existingIdentity.id,
                            userId,
                        })
                        .update({
                            isPrimary:
                                identityTypeId === primaryIdentityTypeId,
                        });
            } else {
                // Doesn't exist → create
                identity =
                    await this.prisma.client.orm.public.UserIdentity
                        .create({
                            userId,
                            identityTypeId,
                            isPrimary:
                                identityTypeId === primaryIdentityTypeId,
                        });
            }

            identities.push({
                ...identity,
                identityType,
            });
        }

        return identities;
    }

    // =====================================
    // GET CURRENT USER IDENTITIES
    // =====================================

    async getUserIdentities(userId: number) {

        const userIdentities =
            await this.prisma.client.orm.public.UserIdentity
                .where({
                    userId,
                })
                .all();

        const identities = [];

        for (const identity of userIdentities) {

            const identityType =
                await this.prisma.client.orm.public.IdentityType
                    .where({
                        id: identity.identityTypeId,
                    })
                    .first();

            identities.push({
                ...identity,
                identityType,
            });
        }

        return identities;
    }


    // =====================================
    // UPDATE USER IDENTITY
    // =====================================

    async updateUserIdentity(
        userId: number,
        userIdentityId: number,
        dto: UpdateUserIdentityDto,
    ) {
        console.log('🔍 JWT userId:', userId);
        console.log('🔍 URL userIdentityId:', userIdentityId);
        console.log('🔍 DTO:', dto);

        const identity =
            await this.prisma.client.orm.public.UserIdentity
                .where({
                    id: userIdentityId,
                    userId,
                })
                .first();

        console.log('📦 Found identity:', identity);

        if (!identity) {
            throw new Error('User identity not found');
        }

        const updatedIdentity =
            await this.prisma.client.orm.public.UserIdentity
                .where({
                    id: userIdentityId,
                    userId,
                })
                .update({
                    isPrimary: dto.isPrimary,
                });

        const identityType =
            await this.prisma.client.orm.public.IdentityType
                .where({
                    id: identity.identityTypeId,
                })
                .first();

        return {
            ...updatedIdentity,
            identityType,
        };
    }


    // =====================================
    // DELETE USER IDENTITY
    // =====================================

    async deleteUserIdentity(
        userId: number,
        userIdentityId: number,
    ) {

        const identity =
            await this.prisma.client.orm.public.UserIdentity
                .where({
                    id: userIdentityId,
                    userId,
                })
                .first();

        if (!identity) {
            throw new Error('User identity not found');
        }


        const identityType =
            await this.prisma.client.orm.public.IdentityType
                .where({
                    id: identity.identityTypeId,
                })
                .first();


        await this.prisma.client.orm.public.UserIdentity
            .where({
                id: userIdentityId,
                userId,
            })
            .delete();


        return {
            message: 'User identity deleted successfully',
            identity: {
                ...identity,
                identityType,
            },
        };
    }
}