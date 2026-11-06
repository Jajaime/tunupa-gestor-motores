import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { SessionAccessService } from '../auth/session-access.service';
import type { AccessTokenPayload, RequestMetadata } from '../auth/auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface ProfileRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  lastLoginAt: Date | string | null;
  passwordChangedAt: Date | string;
}
interface PasswordRow {
  id: string;
  email: string;
  password_hash: string;
}
interface SessionRow {
  id: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  ipAddress: string | null;
  userAgent: string | null;
}
interface RevokedRow {
  id: string;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly db: DataSource,
    private readonly sessionAccess: SessionAccessService,
  ) {}

  async profile(user: AccessTokenPayload) {
    const rows = await this.db.query<ProfileRow[]>(
      `SELECT id, email, display_name AS "displayName", role,
              last_login_at AS "lastLoginAt",
              password_changed_at AS "passwordChangedAt"
       FROM public.users WHERE id = $1 AND status = 'ACTIVE'`,
      [user.sub],
    );
    if (!rows[0]) throw new UnauthorizedException('Cuenta no disponible.');
    return rows[0];
  }

  async sessions(user: AccessTokenPayload) {
    const rows = await this.db.query<SessionRow[]>(
      `SELECT id, created_at AS "createdAt", expires_at AS "expiresAt",
              ip_address AS "ipAddress", user_agent AS "userAgent"
       FROM public.auth_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [user.sub],
    );
    return rows.map((row) => ({ ...row, isCurrent: row.id === user.sid }));
  }

  async changePassword(
    user: AccessTokenPayload,
    dto: ChangePasswordDto,
    metadata: RequestMetadata,
  ): Promise<{ revokedSessions: number }> {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La contraseña nueva debe ser distinta.');
    }
    // Lock prevents concurrent password changes from accepting a stale password.
    const revoked = await this.db.transaction(async (manager) => {
      const rows = await manager.query<PasswordRow[]>(
        `SELECT id, email, password_hash FROM public.users
         WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [user.sub],
      );
      const account = rows[0];
      if (!account) throw new UnauthorizedException('Cuenta no disponible.');
      if (!(await argon2.verify(account.password_hash, dto.currentPassword))) {
        throw new BadRequestException('Contraseña actual incorrecta.');
      }
      const passwordHash = await argon2.hash(dto.newPassword);
      await manager.query(
        `UPDATE public.users SET password_hash = $2,
            password_changed_at = now() WHERE id = $1`,
        [user.sub, passwordHash],
      );
      const sessions = await manager.query<RevokedRow[]>(
        `UPDATE public.auth_sessions SET revoked_at = now()
         WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
         RETURNING id`,
        [user.sub, user.sid],
      );
      await manager.query(
        `INSERT INTO public.auth_events
          (user_id, email, event_type, success, ip_address, user_agent)
         VALUES ($1, $2, 'PASSWORD_CHANGE', true, $3, $4)`,
        [
          user.sub,
          account.email,
          metadata.ipAddress ?? null,
          metadata.userAgent?.slice(0, 500) ?? null,
        ],
      );
      return sessions;
    });
    for (const session of revoked) this.sessionAccess.revoked(session.id);
    return { revokedSessions: revoked.length };
  }

  async revokeSession(
    user: AccessTokenPayload,
    sessionId: string,
  ): Promise<void> {
    if (sessionId === user.sid) {
      throw new BadRequestException(
        'Para cerrar esta sesión utiliza Cerrar sesión.',
      );
    }
    const rows = await this.db.query<RevokedRow[]>(
      `UPDATE public.auth_sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         AND expires_at > now() RETURNING id`,
      [sessionId, user.sub],
    );
    if (!rows[0]) throw new NotFoundException('Sesión no encontrada.');
    this.sessionAccess.revoked(sessionId);
  }

  async revokeOthers(
    user: AccessTokenPayload,
  ): Promise<{ revokedSessions: number }> {
    const rows = await this.db.query<RevokedRow[]>(
      `UPDATE public.auth_sessions SET revoked_at = now()
       WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
         AND expires_at > now() RETURNING id`,
      [user.sub, user.sid],
    );
    for (const row of rows) this.sessionAccess.revoked(row.id);
    return { revokedSessions: rows.length };
  }
}
