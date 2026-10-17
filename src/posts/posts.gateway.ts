
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PostsGateway {
  @WebSocketServer()
  server!: Server;

  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY = 1000;

  private pendingPosts: unknown[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  emitPostCreated(post: unknown): void {
    this.pendingPosts.push(post);

    console.log(
      `📥 Post added to Socket.IO buffer. Pending: ${this.pendingPosts.length}`,
    );

    // 10 posts bhega thay to immediately flush karo.
    if (this.pendingPosts.length >= this.BATCH_SIZE) {
      this.flushPendingPosts();
      return;
    }

    // Ochha posts hoy to maximum 1 second wait karo.
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

      // Client ne array ma maximum 10 posts moklo.
      this.server.emit('posts-batch', batch);
    }
  }
}
