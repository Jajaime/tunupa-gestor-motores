import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app);
  }
  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      maxHttpBufferSize: 16_384,
      connectTimeout: 10_000,
      cors: { origin: this.origin, credentials: true },
      allowRequest: (request, callback) =>
        callback(null, request.headers.origin === this.origin),
    } satisfies Partial<ServerOptions>) as Server;
  }
}
