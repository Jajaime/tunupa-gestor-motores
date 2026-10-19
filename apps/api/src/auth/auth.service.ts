import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { SessionAccessService } from './session-access.service';
import { AuthSession } from './entities/auth-session.entity';
import { User } from './entities/user.entity';
import type { AuthenticatedUser, RequestMetadata } from './auth.types';

interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(randomBytes(32));

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly sessionAccess: SessionAccessService,
  ) {}

  async login(
    emailInput: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<IssuedSession> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    const locked =
      !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();

    if (!user || !passwordMatches || locked || user.status === 'DISABLED') {
      if (user && !passwordMatches && !locked) await this.registerFailure(user);
      await this.audit(user?.id, email, 'LOGIN', false, metadata);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.status = 'ACTIVE';
    user.lastLoginAt = new Date();
    await this.users.save(user);
    await this.audit(user.id, email, 'LOGIN', true, metadata);
    return this.issueSession(user, metadata);
  }

  async refresh(
    rawToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<IssuedSession> {
    if (!rawToken) throw new UnauthorizedException('Sesión inválida.');
    // Una sola transacción consume el token y guarda su reemplazo en la misma
    // sesión. Un replay o refresh concurrente no puede consumirlo dos veces.
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthSession);
      const session = await repository
        .createQueryBuilder('session')
        .addSelect('session.tokenHash')
        .where('session.token_hash = :hash', { hash: this.hashToken(rawToken) })
        .andWhere('session.revoked_at IS NULL AND session.expires_at > now()')
        .setLock('pessimistic_write')
        .getOne();
      if (!session) throw new UnauthorizedException('Sesión inválida.');
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id: session.userId } });
      if (!user || user.status !== 'ACTIVE')
        throw new UnauthorizedException('Sesión inválida.');
      const refreshToken = randomBytes(48).toString('base64url');
      session.tokenHash = this.hashToken(refreshToken);
      session.expiresAt = new Date(
        Date.now() +
          this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS') * 86_400_000,
      );
      session.ipAddress = metadata.ipAddress ?? null;
      session.userAgent = metadata.userAgent?.slice(0, 500) ?? null;
      await repository.save(session);
      const accessToken = await this.signAccess(user, session.id);
      await this.audit(user.id, user.email, 'REFRESH', true, metadata, manager);
      return {
        accessToken,
        refreshToken,
        user: this.toAuthenticatedUser(user),
      };
    });
    return result;
  }

  async logout(
    sid: string,
    userId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    // El sid viene del access token ya verificado, nunca del cuerpo del navegador.
    // Revocar por sid también funciona si otra petición acaba de rotar el refresh.
    const rows: { email: string }[] = await this.dataSource.query(
      `WITH revoked AS (
         UPDATE public.auth_sessions SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING user_id
       ) SELECT u.email FROM revoked r JOIN public.users u ON u.id = r.user_id`,
      [sid, userId],
    );
    this.sessionAccess.revoked(sid);
    if (rows[0])
      await this.audit(userId, rows[0].email, 'LOGOUT', true, metadata);
  }

  toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private async issueSession(
    user: User,
    metadata: RequestMetadata,
  ): Promise<IssuedSession> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshDays = this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS');
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        revokedAt: null,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent?.slice(0, 500) ?? null,
      }),
    );
    const accessToken = await this.signAccess(user, session.id);
    return { accessToken, refreshToken, user: this.toAuthenticatedUser(user) };
  }

  private signAccess(user: User, sid: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, sid },
      { expiresIn: this.config.getOrThrow<number>('AUTH_ACCESS_TTL_SECONDS') },
    );
  }

  private async registerFailure(user: User): Promise<void> {
    user.failedLoginAttempts += 1;
    const maximum = this.config.getOrThrow<number>('AUTH_MAX_LOGIN_ATTEMPTS');
    if (user.failedLoginAttempts >= maximum) {
      user.lockedUntil = new Date(
        Date.now() +
          this.config.getOrThrow<number>('AUTH_LOCK_MINUTES') * 60_000,
      );
      user.status = 'LOCKED';
    }
    await this.users.save(user);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async audit(
    userId: string | undefined,
    email: string,
    eventType: string,
    success: boolean,
    metadata: RequestMetadata,
    executor: Pick<DataSource, 'query'> = this.dataSource,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO public.auth_events (user_id, email, event_type, success, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId ?? null,
        email,
        eventType,
        success,
        metadata.ipAddress ?? null,
        metadata.userAgent?.slice(0, 500) ?? null,
      ],
    );
  }
}
