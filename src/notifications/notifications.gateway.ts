
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: [
      'https://evolve-inky-five.vercel.app',
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token;

      if (!token || typeof token !== 'string') {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);

      const userId = Number(payload.sub);

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      await client.join(`user:${userId}`);

      console.log(
        `🔔 Notification socket authenticated for user ${userId}`,
      );
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    console.log('🔕 Notification socket disconnected:', client.id);
  }

  emitNotification(userId: number, notification: unknown): void {
    this.server
      .to(`user:${userId}`)
      .emit('notification.created', notification);
  }
}
