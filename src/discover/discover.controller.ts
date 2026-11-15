
import {
  Controller,
  Get,
  Req,
  Query,
  Param,
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
  ) { }

  // 1. Get accepted connections posts
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
      Number(req.user.userId),
      limit,
      cursor,
    );
  }

  // 2. Get posts by selected skill
  @Get('skills/:skillId/posts')
  getSkillPosts(
    @Req() req: Request & {
      user: { userId: number };
    },

    @Param('skillId', ParseIntPipe)
    skillId: number,

    @Query('limit', new DefaultValuePipe(10), ParseIntPipe)
    limit: number,

    @Query('cursor')
    cursor?: string,
  ) {
    return this.discoverService.getSkillPosts(
      Number(req.user.userId),
      skillId,
      limit,
      cursor,
    );
  }


  // 3. Get posts based on user's selected curiosities
  @Get('curiosities/posts')
  getCuriosityPosts(
    @Req() req: Request & {
      user: { userId: number };
    },

    @Query('limit', new DefaultValuePipe(10), ParseIntPipe)
    limit: number,

    @Query('cursor')
    cursor?: string,
  ) {
    return this.discoverService.getCuriosityPosts(
      Number(req.user.userId),
      limit,
      cursor,
    );
  }

  // 4. Get post counts for selected curiosities
  @Get('skills/counts')
  getSkillPostCounts(
    @Req() req: Request & {
      user: { userId: number };
    },
  ) {
    return this.discoverService.getSkillPostCounts(
      Number(req.user.userId),
    );
  }

}
