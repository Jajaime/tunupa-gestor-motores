import { CommittedEventsService } from './committed-events.service';
import type { DashboardEvent } from './dashboard-event.types';
import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/auth.constants';
import { TenantAccessService } from '../tenant-access/tenant-access.service';
import type { AccessTokenPayload } from '../auth/auth.types';
import {
  SessionAccessError,
  SessionAccessService,
} from '../auth/session-access.service';

interface Connection {
  ready: boolean;
  claims: AccessTokenPayload;
  expiry?: ReturnType<typeof setTimeout>;
}

export function accessCookie(header: string | undefined): string | undefined {
  const matches = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${ACCESS_COOKIE}=`));
  if (matches.length !== 1) return undefined;
  try {
    return decodeURIComponent(matches[0].slice(ACCESS_COOKIE.length + 1));
  } catch {
    return undefined;
  }
}

@WebSocketGateway({ namespace: '/dashboard', transports: ['websocket'] })
export class DashboardGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly connections = new Map<Socket, Connection>();
  private interval?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private checking = false;
  private unsubscribeData?: () => void;
  private readonly batches: DashboardEvent[][] = [];
  private sending = false;
  private destroyed = false;

  constructor(
    private readonly sessions: SessionAccessService,
    private readonly config: ConfigService,
    private readonly events: CommittedEventsService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      // CORS no protege el handshake WebSocket: también se exige Origin aquí.
      if (
        socket.handshake.headers.origin !==
        this.config.getOrThrow<string>('WEB_ORIGIN')
      ) {
        next(
          Object.assign(new Error('Origen no permitido.'), {
            data: { code: 'ORIGIN_FORBIDDEN' },
          }),
        );
        return;
      }
      void this.sessions
        .verify(accessCookie(socket.handshake.headers.cookie))
        .then(
          (claims) => {
            (socket.data as { claims?: AccessTokenPayload }).claims = claims;
            next();
          },
          (error: unknown) =>
            next(
              Object.assign(new Error('Conexión no autorizada.'), {
                data: {
                  code:
                    error instanceof SessionAccessError
                      ? error.code
                      : 'SERVER_UNAVAILABLE',
                },
              }),
            ),
        );
    });
    this.unsubscribe = this.sessions.onRevoked((sid) => {
      for (const [socket, entry] of this.connections) {
        if (entry.claims.sid === sid) this.close(socket, 'SESSION_REVOKED');
      }
    });
    this.unsubscribeData = this.events.subscribe((batch) =>
      this.enqueue(batch),
    );
    this.interval = setInterval(() => {
      void this.revalidate();
    }, 5000);
    this.interval.unref();
  }

  async handleConnection(socket: Socket): Promise<void> {
    const claims = (socket.data as { claims?: AccessTokenPayload }).claims;
    if (!claims) {
      socket.disconnect(true);
      return;
    }
    const entry: Connection = { claims, ready: false };
    this.connections.set(socket, entry);
    try {
      // Vuelve a comprobar por si hubo logout durante el handshake.
      await this.sessions.validate(claims);
      if (!socket.connected || this.connections.get(socket) !== entry) return;
      const remaining = claims.exp * 1000 - Date.now();
      if (remaining <= 0) {
        this.close(socket, 'ACCESS_EXPIRED');
        return;
      }
      entry.expiry = setTimeout(
        () => this.close(socket, 'ACCESS_EXPIRED'),
        Math.min(remaining, 2_147_483_647),
      );
      entry.expiry.unref();
      entry.ready = true;
      socket.emit('session.ready', {
        version: 1,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      });
    } catch (error) {
      this.close(
        socket,
        error instanceof SessionAccessError ? error.code : 'SERVER_UNAVAILABLE',
      );
    }
  }

  handleDisconnect(socket: Socket): void {
    const entry = this.connections.get(socket);
    if (entry?.expiry) clearTimeout(entry.expiry);
    this.connections.delete(socket);
  }

  private close(socket: Socket, code: string): void {
    if (!this.connections.has(socket)) return;
    const event =
      code === 'ACCESS_EXPIRED'
        ? 'session.expired'
        : code === 'SERVER_UNAVAILABLE'
          ? 'session.unavailable'
          : 'session.revoked';
    socket.emit(event, { version: 1, code });
    this.handleDisconnect(socket);
    socket.disconnect(true);
  }

  private async revalidate(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const [socket, entry] of this.connections) {
        try {
          entry.claims = await this.sessions.validate(entry.claims);
        } catch (error) {
          this.close(
            socket,
            error instanceof SessionAccessError
              ? error.code
              : 'SERVER_UNAVAILABLE',
          );
        }
      }
    } finally {
      this.checking = false;
    }
  }

  private enqueue(batch: DashboardEvent[]): void {
    if (this.destroyed || this.connections.size === 0) return;
    // Memoria acotada: ante un consumidor/base demasiado lento se reconecta y
    // resincroniza por HTTP, en lugar de acumular eventos indefinidamente.
    if (this.batches.length >= 100) {
      this.batches.length = 0;
      for (const socket of this.connections.keys())
        this.close(socket, 'SERVER_UNAVAILABLE');
      return;
    }
    this.batches.push(batch);
    void this.deliver();
  }

  private async deliver(): Promise<void> {
    if (this.sending || this.destroyed) return;
    this.sending = true;
    try {
      let batch: DashboardEvent[] | undefined;
      while (!this.destroyed && (batch = this.batches.shift())) {
        for (const [socket, entry] of this.connections) {
          if (!entry.ready) continue;
          try {
            entry.claims = await this.sessions.validate(entry.claims);
            if (
              this.connections.get(socket) !== entry ||
              !socket.connected ||
              this.destroyed
            )
              continue;
            if (entry.claims.exp * 1000 <= Date.now()) {
              this.close(socket, 'ACCESS_EXPIRED');
              continue;
            }
            const permitted = await this.tenantAccess.permittedMotorIds(
              entry.claims, batch.map((event) => event.motorId),
            );
            if (this.connections.get(socket) !== entry || !socket.connected) continue;
            for (const event of batch) {
              if (permitted.has(event.motorId)) socket.emit(event.type, event);
            }
          } catch (error) {
            this.close(
              socket,
              error instanceof SessionAccessError
                ? error.code
                : 'SERVER_UNAVAILABLE',
            );
          }
        }
      }
    } finally {
      this.sending = false;
    }
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.unsubscribeData?.();
    this.batches.length = 0;
    if (this.interval) clearInterval(this.interval);
    this.unsubscribe?.();
    for (const socket of this.connections.keys()) {
      this.handleDisconnect(socket);
      socket.disconnect(true);
    }
  }
}
