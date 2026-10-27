
import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';

import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
  ) {}

  // 1. Search accepted connections
  @Get('connections/search')
  searchConnections(
    @Req() req: Request,
    @Query('search') search = '',
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.searchConnections(
      currentUserId,
      search,
    );
  }

  // 2. Get all conversations
  @Get('conversations')
  getConversations(@Req() req: Request) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.getConversations(
      currentUserId,
    );
  }

  // 3. Start conversation with a connection
  @Post('conversations/start/:receiverId')
  startConversation(
    @Req() req: Request,
    @Param('receiverId', ParseIntPipe) receiverId: number,
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.startConversation(
      currentUserId,
      receiverId,
    );
  }

  // 4. Get conversation details
  @Get('conversations/:conversationId')
  getConversation(
    @Req() req: Request,
    @Param('conversationId', ParseIntPipe)
    conversationId: number,
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.getConversation(
      currentUserId,
      conversationId,
    );
  }

  // 5. Get messages with pagination
  @Get('conversations/:conversationId/messages')
  getMessages(
    @Req() req: Request,
    @Param('conversationId', ParseIntPipe)
    conversationId: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe)
    limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe)
    offset: number,
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.getMessages(
      currentUserId,
      conversationId,
      limit,
      offset,
    );
  }

  // 6. Send a message
  @Post('conversations/:conversationId/messages')
  sendMessage(
    @Req() req: Request,
    @Param('conversationId', ParseIntPipe)
    conversationId: number,
    @Body('content') content: string,
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.sendMessage(
      currentUserId,
      conversationId,
      content,
    );
  }

  // 7. Mark incoming messages as read
  @Patch('conversations/:conversationId/read')
  markMessagesRead(
    @Req() req: Request,
    @Param('conversationId', ParseIntPipe)
    conversationId: number,
  ) {
    const currentUserId = Number((req as any).user.userId);

    return this.messagingService.markMessagesRead(
      currentUserId,
      conversationId,
    );
  }
}
