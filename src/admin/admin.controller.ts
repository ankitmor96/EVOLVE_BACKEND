
import {
    Body,
    Controller,
    Post,
    Get,
    Query,
} from '@nestjs/common';

import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
    ) { }

    // Admin Login API
    @Post('login')
    async login(
        @Body()
        body: {
            email: string;
            password: string;
        },
    ) {
        return this.adminService.login(body);
    }

    // Admin Dashboard Summary API
    @Get('dashboard/summary')
    async getDashboardSummary() {
        return this.adminService.getDashboardSummary();
    }


    // Admin - Get All Users API
    @Get('users')
    async getAllUsers(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminService.getAllUsers(
            page ? Number(page) : 1,
            limit ? Number(limit) : 100,
        );
    }


    // Admin - Get All Posts API
    @Get('posts')
    async getAllPosts(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminService.getAllPosts(
            page ? Number(page) : 1,
            limit ? Number(limit) : 100,
        );
    }

}
