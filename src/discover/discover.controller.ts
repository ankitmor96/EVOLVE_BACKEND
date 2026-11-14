
import {
  Controller,
  Get,
  Req,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';

import { Request } from 'express';

import { DiscoverService } from './discover.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('discover')
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(
    private readonly discoverService: DiscoverService,
  ) {}

  @Get('connections/posts')
  getConnectionsPosts(
    @Req() req: Request & {
      user: { userId: number };
    },

    @Query('limit', new DefaultValuePipe(10), ParseIntPipe)
    limit: number,

    @Query('cursor')
    cursor?: string,
  ) {
    return this.discoverService.getConnectionsPosts(
      req.user.userId,
      limit,
      cursor,
    );
  }
}
