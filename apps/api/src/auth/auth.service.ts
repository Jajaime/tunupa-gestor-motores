import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
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
    const tokenHash = this.hashToken(rawToken);
    const rotationResult: unknown = await this.dataSource.query(
      `UPDATE public.auth_sessions
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [tokenHash],
    );
    const rows =
      Array.isArray(rotationResult) && Array.isArray(rotationResult[0])
        ? rotationResult[0]
        : rotationResult;
    const firstRow = Array.isArray(rows) ? (rows[0] as unknown) : undefined;
    const userId =
      typeof firstRow === 'object' &&
      firstRow !== null &&
      'user_id' in firstRow &&
      typeof firstRow.user_id === 'string'
        ? firstRow.user_id
        : undefined;
    const user = userId
      ? await this.users.findOne({ where: { id: userId } })
      : null;

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Sesión inválida.');
    }

    await this.audit(user.id, user.email, 'REFRESH', true, metadata);
    return this.issueSession(user, metadata);
  }

  async logout(
    rawToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<void> {
    if (!rawToken) return;
    const session = await this.sessions.findOne({
      where: {
        tokenHash: this.hashToken(rawToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
      select: {
        id: true,
        tokenHash: true,
        userId: true,
        user: { id: true, email: true },
      },
    });
    if (!session) return;
    session.revokedAt = new Date();
    await this.sessions.save(session);
    await this.audit(
      session.userId,
      session.user.email,
      'LOGOUT',
      true,
      metadata,
    );
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
    await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        revokedAt: null,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent?.slice(0, 500) ?? null,
      }),
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: this.config.getOrThrow<number>('AUTH_ACCESS_TTL_SECONDS') },
    );
    return { accessToken, refreshToken, user: this.toAuthenticatedUser(user) };
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
  ): Promise<void> {
    await this.dataSource.query(
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
