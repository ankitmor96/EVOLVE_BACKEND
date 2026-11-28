
import {
    Body,
    Controller,
    Post,
    Get,
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
}
