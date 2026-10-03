import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';

import { SkillService } from './skill.service';

import { CreateUserCuriosityDto } from './dto/create-user-curiosity.dto';

import { UpdateUserCuriosityDto } from './dto/update-user-curiosity.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateUserSkillDto } from './dto/create-user-skill.dto';

import { UpdateUserSkillDto } from './dto/update-user-skill.dto';

@Controller('skills')
export class SkillController {
    constructor(
        private readonly skillService: SkillService,
    ) { }

    // =====================================
    // GET ALL SKILL CATEGORIES
    // =====================================

    @Get('categories')
    async getSkillCategories() {
        return this.skillService.getSkillCategories();
    }

    // =====================================
    // GET SKILLS BY CATEGORY
    // =====================================

    @Get('categories/:categoryId/skills')
    async getSkillsByCategory(
        @Param('categoryId') categoryId: string,
    ) {
        return this.skillService.getSkillsByCategory(
            Number(categoryId),
        );
    }

    // =====================================
    // CREATE USER CURIOSITY
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Post('curiosity')
    async createUserCuriosity(
        @Req() req: any,
        @Body() dto: CreateUserCuriosityDto,
    ) {
        const userId = req.user.userId;

        return this.skillService.createUserCuriosity(
            userId,
            dto,
        );
    }

    // =====================================
    // GET USER CURIOSITY
    // =====================================

    @UseGuards(JwtAuthGuard)
    @Get('curiosity')
    async getUserCuriosity(
        @Req() req: any,
    ) {
        const userId = req.user.userId;

        return this.skillService.getUserCuriosity(
            userId,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Patch('curiosity')
    async updateUserCuriosity(
        @Req() req: any,
        @Body() dto: UpdateUserCuriosityDto,
    ) {
        const userId = req.user.userId;

        return this.skillService.updateUserCuriosity(
            userId,
            dto,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Delete('curiosity/:id')
    async deleteUserCuriosity(
        @Req() req: any,
        @Param('id') id: string,
    ) {
        const userId = req.user.userId;

        return this.skillService.deleteUserCuriosity(
            userId,
            Number(id),
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('user-skills')
    async createUserSkills(
        @Req() req: any,
        @Body() dto: CreateUserSkillDto,
    ) {
        const userId = req.user.userId;

        return this.skillService.createUserSkills(
            userId,
            dto,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Get('user-skills')
    async getUserSkills(
        @Req() req: any,
    ) {
        const userId = req.user.userId;

        return this.skillService.getUserSkills(
            userId,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Patch('user-skills/:id')
    async updateUserSkill(
        @Req() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateUserSkillDto,
    ) {
        const userId = req.user.userId;

        return this.skillService.updateUserSkill(
            userId,
            Number(id),
            dto,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Delete('user-skills/:id')
    async deleteUserSkill(
        @Req() req: any,
        @Param('id') id: string,
    ) {
        const userId = req.user.userId;

        return this.skillService.deleteUserSkill(
            userId,
            Number(id),
        );
    }
}