import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';

import { AdminService } from './admin.service';
import { CreateIdentityTypeDto } from './dto/create-identity-type.dto';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin/identity-types')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post()
    async createIdentityType(
        @Body() dto: CreateIdentityTypeDto,
    ) {
        return this.adminService.createIdentityType(dto);
    }

    @Get()
    @UseGuards(JwtAuthGuard, AdminGuard)
    async getIdentityTypes() {
        return this.adminService.getIdentityTypes();
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async disableIdentityType(@Param('id') id: string) {
        return this.adminService.disableIdentityType(Number(id));
    }
}