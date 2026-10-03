import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Delete,
    Req,
    UseGuards,
} from '@nestjs/common';

import { IdentityService } from './identity.service';
import { CreateUserIdentitiesDto } from './dto/create-user-identities.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserIdentityDto } from './dto/update-user-identity.dto';

@Controller()
export class IdentityController {
    constructor(
        private readonly identityService: IdentityService,
    ) {}

    // =====================================
    // GET ALL IDENTITY TYPES
    // =====================================

    
    @Get('identity-types')
    async getIdentityTypes() {
        return this.identityService.getIdentityTypes();
    }

    // =====================================
    // GET CURRENT USER IDENTITIES
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('user-identities')
    async getUserIdentities(@Req() req: any) {
        const userId = req.user.userId;

        return this.identityService.getUserIdentities(userId);
    }

    // =====================================
    // SELECT USER IDENTITIES
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('user-identities/select')
    async createUserIdentities(
        @Req() req: any,
        @Body() dto: CreateUserIdentitiesDto,
    ) {
        return this.identityService.createUserIdentities(
            req.user.userId,
            dto.identityTypeIds,
            dto.primaryIdentityTypeId,
        );
    }

    // =====================================
    // UPDATE USER IDENTITY
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Patch('user-identities/:id')
    async updateUserIdentity(
        @Req() req: any,
        @Body() dto: UpdateUserIdentityDto,
        @Param('id') id: string,
    ) {
        const userId = req.user.userId;

        return this.identityService.updateUserIdentity(
            userId,
            Number(id),
            dto,
        );
    }

    // =====================================
    // DELETE USER IDENTITY
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Delete('user-identities/:id')
    async deleteUserIdentity(
        @Req() req: any,
        @Param('id') id: string,
    ) {
        const userId = req.user.userId;

        return this.identityService.deleteUserIdentity(
            userId,
            Number(id),
        );
    }
}