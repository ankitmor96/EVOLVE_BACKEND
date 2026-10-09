import {
    Controller,
    Get,
    Req,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';


import { HomeService } from './home.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('home')
export class HomeController {
    constructor(
        private readonly homeService: HomeService,
    ) { }

    // ========================================
    // HOME TABS
    // ========================================

    @Get('tabs')
    @UseGuards(JwtAuthGuard)
    async getHomeTabs(@Req() req: any) {
        const user = req.user as {
            userId: number;
        };

        if (!user?.userId) {
            throw new UnauthorizedException(
                'User authentication required',
            );
        }

        return this.homeService.getHomeTabs(
            user.userId,
        );
    }
}