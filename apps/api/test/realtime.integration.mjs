import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { io } from 'socket.io-client';
const require = createRequire(import.meta.url);
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { APP_GUARD } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const argon2 = require('argon2');
const {
  CommittedEventsService,
} = require('../dist/realtime/committed-events.service');
const { AuthService } = require('../dist/auth/auth.service');
const { AuthController } = require('../dist/auth/auth.controller');
const { SessionAccessService } = require('../dist/auth/session-access.service');
const { User } = require('../dist/auth/entities/user.entity');
const { AuthSession } = require('../dist/auth/entities/auth-session.entity');
const { AccessTokenGuard } = require('../dist/auth/guards/access-token.guard');
const { CsrfGuard } = require('../dist/auth/guards/csrf.guard');
const { DashboardGateway } = require('../dist/realtime/dashboard.gateway');
const { RealtimeAdapter } = require('../dist/realtime/realtime.adapter');
config({ path: resolve('.env'), quiet: true });
config({ path: resolve('../../.env'), override: false, quiet: true });

function event(socket, name, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, done);
      reject(new Error(`No llegó ${name}`));
    }, timeout);
    function done(value) {
      clearTimeout(timer);
      resolve(value);
    }
    socket.once(name, done);
  });
}

test(
  'sesiones HTTP y Socket.IO: autenticación, rotación, expiración y logout aislado',
  { timeout: 30_000 },
  async (t) => {
    for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'])
      assert(process.env[key], `Falta ${key}`);
    const db = new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      entities: [User, AuthSession],
      synchronize: false,
      logging: false,
      connectTimeoutMS: 10000,
    });
    await db.initialize();
    const runner = db.createQueryRunner();
    let app;
    const sockets = [];
    try {
      await runner.connect();
      await runner.startTransaction();
      const manager = runner.manager;
      const source = {
        query: (...args) => manager.query(...args),
        transaction: (work) => manager.transaction(work),
      };
      const origin = 'http://localhost:3000';
      const settings = new ConfigService({
        WEB_ORIGIN: origin,
        AUTH_ACCESS_TTL_SECONDS: 60,
        AUTH_REFRESH_TTL_DAYS: 1,
        AUTH_COOKIE_SECURE: false,
        AUTH_MAX_LOGIN_ATTEMPTS: 5,
        AUTH_LOCK_MINUTES: 15,
      });
      const jwt = new JwtService({ secret: randomUUID() + randomUUID() });
      const sessions = new SessionAccessService(jwt, source);
      const auth = new AuthService(
        manager.getRepository(User),
        manager.getRepository(AuthSession),
        jwt,
        settings,
        source,
        sessions,
      );
      const email = `verify-${randomUUID()}@example.invalid`;
      const password = randomUUID() + 'Test1!';
      const user = await manager.getRepository(User).save({
        email,
        displayName: 'Prueba aislada',
        passwordHash: await argon2.hash(password),
        role: 'ADMIN',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
      });
      const module = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: auth },
          { provide: ConfigService, useValue: settings },
          { provide: SessionAccessService, useValue: sessions },
          DashboardGateway,
          {
            provide: CommittedEventsService,
            useValue: new CommittedEventsService(db),
          },
          { provide: APP_GUARD, useClass: CsrfGuard },
          { provide: APP_GUARD, useClass: AccessTokenGuard },
        ],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      app.useWebSocketAdapter(new RealtimeAdapter(app, origin));
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const jar = new Map();
      const cookies = (map = jar) =>
        [...map].map(([k, v]) => `${k}=${v}`).join('; ');
      async function request(
        path,
        method = 'GET',
        body,
        map = jar,
        csrf = true,
      ) {
        const response = await fetch(`${base}/api/v1/auth/${path}`, {
          method,
          headers: {
            Cookie: cookies(map),
            Origin: origin,
            'Content-Type': 'application/json',
            ...(csrf && map.has('tunupa_csrf')
              ? { 'X-CSRF-Token': map.get('tunupa_csrf') }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const header of response.headers.getSetCookie()) {
          const pair = header.split(';')[0];
          const at = pair.indexOf('=');
          map.set(pair.slice(0, at), pair.slice(at + 1));
        }
        return response;
      }
      function socket(cookie = cookies(), requestOrigin = origin) {
        const client = io(`${base}/dashboard`, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          autoConnect: false,
          extraHeaders: { Origin: requestOrigin, Cookie: cookie },
        });
        sockets.push(client);
        return client;
      }
      async function denied(cookie, expected, requestOrigin = origin) {
        const client = socket(cookie, requestOrigin);
        const error = event(client, 'connect_error');
        client.connect();
        const result = await error;
        if (expected) assert.equal(result.data?.code, expected);
        client.disconnect();
      }
      async function connected(cookie = cookies()) {
        const client = socket(cookie);
        const ready = event(client, 'session.ready');
        client.connect();
        assert.equal((await ready).version, 1);
        return client;
      }
      assert.equal((await request('me')).status, 401);
      await denied('', 'AUTH_REQUIRED');
      await denied('', undefined, 'https://untrusted.invalid');
      await denied('', undefined, '');
      await request('csrf');
      assert.equal(
        (await request('login', 'POST', { email, password }, jar, false))
          .status,
        403,
      );
      assert.equal(
        (await request('login', 'POST', { email, password })).status,
        200,
      );
      assert.equal((await request('me')).status, 200);
      const initial = new Map(jar);
      const claims = jwt.decode(jar.get('tunupa_access'));
      assert.equal(claims.sub, user.id);
      assert(claims.sid);
      const wrongUser = await jwt.signAsync({ ...claims, sub: randomUUID() });
      await denied(`tunupa_access=${wrongUser}`, 'SESSION_REVOKED');
      const legacy = await jwt.signAsync(
        { sub: user.id, email, role: 'ADMIN' },
        { expiresIn: 60 },
      );
      await denied(`tunupa_access=${legacy}`, 'AUTH_REQUIRED');
      await denied('tunupa_access=invalid.jwt.signature', 'AUTH_REQUIRED');
      const first = await connected();
      const secondTab = await connected();
      t.diagnostic(
        'OK: handshake con cookies, rechazo anónimo/origen ajeno y protección CSRF.',
      );

      // Si falla la emisión del reemplazo, rollback conserva el refresh anterior.
      const originalSign = jwt.signAsync;
      jwt.signAsync = async () => {
        throw new Error('signing failure for rollback test');
      };
      try {
        await assert.rejects(
          auth.refresh(jar.get('tunupa_refresh'), {}),
          /signing failure/,
        );
      } finally {
        jwt.signAsync = originalSign;
      }
      assert.equal((await request('refresh', 'POST')).status, 200);
      assert.equal(jwt.decode(jar.get('tunupa_access')).sid, claims.sid);
      assert.notEqual(jar.get('tunupa_refresh'), initial.get('tunupa_refresh'));
      assert.equal(
        (await request('refresh', 'POST', undefined, new Map(initial))).status,
        401,
      );
      assert.equal(first.connected, true);
      t.diagnostic('OK: refresh rota el token, conserva sid y rechaza replay.');

      const short = await jwt.signAsync(
        { sub: user.id, sid: claims.sid, email, role: 'ADMIN' },
        { expiresIn: 2 },
      );
      const shortSocket = socket(`tunupa_access=${short}`);
      const expiration = event(shortSocket, 'session.expired');
      const closed = event(shortSocket, 'disconnect');
      shortSocket.connect();
      assert.equal((await expiration).code, 'ACCESS_EXPIRED');
      await closed;
      assert.equal(shortSocket.connected, false);
      await denied(`tunupa_access=${short}`, 'ACCESS_EXPIRED');
      await connected();
      t.diagnostic(
        'OK: vencimiento real del JWT cierra el canal y permite reconectar con acceso renovado.',
      );

      // Otro login es una sesión independiente del mismo usuario.
      const otherJar = new Map();
      await request('csrf', 'GET', undefined, otherJar);
      assert.equal(
        (await request('login', 'POST', { email, password }, otherJar)).status,
        200,
      );
      const independent = await connected(cookies(otherJar));
      const revokedFirst = event(first, 'session.revoked');
      const revokedSecond = event(secondTab, 'session.revoked');
      const oldAccess = new Map(jar);
      assert.equal((await request('logout', 'POST')).status, 204);
      assert.equal((await revokedFirst).code, 'SESSION_REVOKED');
      assert.equal((await revokedSecond).code, 'SESSION_REVOKED');
      assert.equal(
        (await request('me', 'GET', undefined, oldAccess)).status,
        401,
      );
      assert.equal(
        (await request('refresh', 'POST', undefined, oldAccess)).status,
        401,
      );
      await denied(cookies(oldAccess), 'SESSION_REVOKED');
      assert.equal(independent.connected, true);
      assert.equal(
        (await request('me', 'GET', undefined, otherJar)).status,
        200,
      );
      t.diagnostic(
        'OK: logout cierra todas las conexiones de su sid, invalida access/refresh y conserva otra sesión.',
      );
      const disabled = event(independent, 'session.revoked');
      await manager.query(
        "UPDATE public.users SET status = 'DISABLED' WHERE id = $1",
        [user.id],
      );
      await app.get(DashboardGateway).revalidate();
      assert.equal((await disabled).code, 'SESSION_REVOKED');
      assert.equal(
        (await request('me', 'GET', undefined, otherJar)).status,
        401,
      );
      t.diagnostic(
        'OK: usuario deshabilitado pierde acceso HTTP y conexión persistente.',
      );
    } finally {
      for (const socket of sockets) socket.disconnect();
      if (app) await app.close();
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        await runner.release();
        await db.destroy();
      }
    }
  },
);
