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
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';
import { CreateSkillDto } from './dto/create-skill.dto';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // ========================================
    // IDENTITY TYPES
    // ========================================

    @Post('identity-types')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async createIdentityType(
        @Body() dto: CreateIdentityTypeDto,
    ) {
        return this.adminService.createIdentityType(dto);
    }

    @Get('identity-types')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async getIdentityTypes() {
        return this.adminService.getIdentityTypes();
    }

    @Delete('identity-types/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async disableIdentityType(
        @Param('id') id: string,
    ) {
        return this.adminService.disableIdentityType(Number(id));
    }

    // ========================================
    // SKILL CATEGORIES
    // ========================================

    @Post('skill-categories')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async createSkillCategory(
        @Body() dto: CreateSkillCategoryDto,
    ) {
        return this.adminService.createSkillCategory(dto);
    }

    @Get('skill-categories')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async getSkillCategories() {
        return this.adminService.getSkillCategories();
    }

    @Delete('skill-categories/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async disableSkillCategory(
        @Param('id') id: string,
    ) {
        return this.adminService.disableSkillCategory(Number(id));
    }

    // ========================================
    // SKILLS
    // ========================================

    @Post('skills')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async createSkill(
        @Body() dto: CreateSkillDto,
    ) {
        return this.adminService.createSkill(dto);
    }

    @Get('skills')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async getSkills() {
        return this.adminService.getSkills();
    }

    @Delete('skills/:id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async disableSkill(
        @Param('id') id: string,
    ) {
        return this.adminService.disableSkill(Number(id));
    }
}