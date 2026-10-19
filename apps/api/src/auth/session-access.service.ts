import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { EventEmitter } from 'node:events';
import type { AccessTokenPayload } from './auth.types';

export class SessionAccessError extends UnauthorizedException {
  constructor(
    readonly code: 'AUTH_REQUIRED' | 'ACCESS_EXPIRED' | 'SESSION_REVOKED',
  ) {
    super('La sesión no está disponible.');
  }
}

@Injectable()
export class SessionAccessService {
  private readonly events = new EventEmitter();
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DataSource,
  ) {}

  async verify(token: string | undefined): Promise<AccessTokenPayload> {
    if (!token) throw new SessionAccessError('AUTH_REQUIRED');
    let claims: AccessTokenPayload;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (error) {
      throw new SessionAccessError(
        error instanceof Error && error.name === 'TokenExpiredError'
          ? 'ACCESS_EXPIRED'
          : 'AUTH_REQUIRED',
      );
    }
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !claims ||
      typeof claims !== 'object' ||
      !uuid.test(claims.sub ?? '') ||
      !uuid.test(claims.sid ?? '') ||
      !Number.isFinite(claims.exp)
    )
      throw new SessionAccessError('AUTH_REQUIRED');
    return this.validate(claims);
  }

  async validate(claims: AccessTokenPayload): Promise<AccessTokenPayload> {
    if (claims.exp * 1000 <= Date.now())
      throw new SessionAccessError('ACCESS_EXPIRED');
    const rows: { email: string; role: string }[] = await this.db.query(
      `SELECT u.email, u.role FROM public.auth_sessions s
       JOIN public.users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.status = 'ACTIVE'`,
      [claims.sid, claims.sub],
    );
    if (!rows[0]) throw new SessionAccessError('SESSION_REVOKED');
    return { ...claims, email: rows[0].email, role: rows[0].role };
  }

  onRevoked(listener: (sid: string) => void): () => void {
    this.events.on('revoked', listener);
    return () => {
      this.events.off('revoked', listener);
    };
  }

  revoked(sid: string): void {
    this.events.emit('revoked', sid);
  }
}
