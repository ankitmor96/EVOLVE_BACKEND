
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PostsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly jwtService: JwtService) {}

  @WebSocketServer()
  server!: Server;

  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY = 700;

  private pendingPosts: unknown[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingPostUpdates: unknown[] = [];
  private postUpdatesFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingCommentUpdates: unknown[] = [];
  private commentUpdatesFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // =========================
  // SOCKET AUTHENTICATION
  // =========================

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token;

      if (typeof token !== 'string' || !token) {
        throw new Error('Socket JWT token is missing');
      }

      const payload = this.jwtService.verify(token);

      const userId = Number(
        payload.sub ?? payload.id ?? payload.userId,
      );

      if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('Invalid user ID in JWT');
      }

      client.data.userId = userId;

      await client.join(`user:${userId}`);

      console.log(
        `🔐 Socket authenticated: ${client.id}, User: ${userId}`,
      );
    } catch (error) {
      console.error('❌ Socket authentication failed:', error);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    console.log('🔌 Socket disconnected:', client.id);
  }

  // =========================
  // PRIVATE MESSAGING EVENT
  // =========================

  emitNewMessage(
    receiverId: number | string,
    data: unknown,
  ): void {
    this.server
      .to(`user:${receiverId}`)
      .emit('message:new', data);

    console.log(
      `📨 New message emitted to user:${receiverId}`,
    );
  }

  // =========================
  // POSTS BATCH
  // =========================

  emitPostCreated(post: unknown): void {
    this.pendingPosts.push(post);

    console.log(
      `📥 Post added to Socket.IO buffer. Pending: ${this.pendingPosts.length}`,
    );

    if (this.pendingPosts.length >= this.BATCH_SIZE) {
      this.flushPendingPosts();
      return;
    }

    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushPendingPosts();
      }, this.BATCH_DELAY);
    }
  }

  private flushPendingPosts(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    while (this.pendingPosts.length > 0) {
      const batch = this.pendingPosts.splice(0, this.BATCH_SIZE);

      console.log(
        `📦 Emitting Socket.IO batch: ${batch.length} post(s)`,
      );

      this.server.emit('posts-batch', batch);
    }
  }

  // =========================
  // POST REACTION / LEARNING UPDATES
  // =========================

  emitPostUpdate(update: unknown): void {
    this.pendingPostUpdates.push(update);

    console.log(
      `📥 Post update added to buffer. Pending: ${this.pendingPostUpdates.length}`,
    );

    if (this.pendingPostUpdates.length >= this.BATCH_SIZE) {
      this.flushPendingPostUpdates();
      return;
    }

    if (this.postUpdatesFlushTimer === null) {
      this.postUpdatesFlushTimer = setTimeout(() => {
        this.postUpdatesFlushTimer = null;
        this.flushPendingPostUpdates();
      }, this.BATCH_DELAY);
    }
  }

  private flushPendingPostUpdates(): void {
    if (this.postUpdatesFlushTimer !== null) {
      clearTimeout(this.postUpdatesFlushTimer);
      this.postUpdatesFlushTimer = null;
    }

    while (this.pendingPostUpdates.length > 0) {
      const batch = this.pendingPostUpdates.splice(
        0,
        this.BATCH_SIZE,
      );

      console.log(
        `📦 Emitting post-updates-batch: ${batch.length} update(s)`,
      );

      this.server.emit('post-updates-batch', batch);
    }
  }

  // =========================
  // COMMENT UPDATES
  // =========================

  emitCommentUpdate(update: unknown): void {
    this.pendingCommentUpdates.push(update);

    console.log(
      `📥 Comment update added to buffer. Pending: ${this.pendingCommentUpdates.length}`,
    );

    if (this.pendingCommentUpdates.length >= this.BATCH_SIZE) {
      this.flushPendingCommentUpdates();
      return;
    }

    if (this.commentUpdatesFlushTimer === null) {
      this.commentUpdatesFlushTimer = setTimeout(() => {
        this.commentUpdatesFlushTimer = null;
        this.flushPendingCommentUpdates();
      }, this.BATCH_DELAY);
    }
  }

  private flushPendingCommentUpdates(): void {
    if (this.commentUpdatesFlushTimer !== null) {
      clearTimeout(this.commentUpdatesFlushTimer);
      this.commentUpdatesFlushTimer = null;
    }

    while (this.pendingCommentUpdates.length > 0) {
      const batch = this.pendingCommentUpdates.splice(
        0,
        this.BATCH_SIZE,
      );

      console.log(
        `📦 Emitting comment-updates-batch: ${batch.length} update(s)`,
      );

      this.server.emit('comment-updates-batch', batch);
    }
  }

  // =========================
  // CONNECTION REAL-TIME EVENTS
  // =========================

  emitConnectionRequested(
    receiverId: number,
    data: unknown,
  ): void {
    this.server.emit('connection.requested', data);
  }

  emitConnectionAccepted(
    requesterId: number,
    data: unknown,
  ): void {
    this.server.emit('connection.accepted', data);
  }

  emitConnectionRejected(
    requesterId: number,
    data: unknown,
  ): void {
    this.server.emit('connection.rejected', data);
  }

  emitConnectionRemoved(
    otherUserId: number,
    data: unknown,
  ): void {
    this.server.emit('connection.removed', data);
  }
}
