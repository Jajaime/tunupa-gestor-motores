import assert from 'node:assert/strict';
import test from 'node:test';

const user = { id: 'user-1', email: 'admin@example.com', role: 'ADMIN' };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function client(t, handler) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const events = new EventTarget();
  let expired = 0;
  events.addEventListener('tunupa:session-expired', () => { expired += 1; });
  globalThis.window = events;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    return handler(new URL(url).pathname.replace('/api/v1', ''), options);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  const url = new URL('../src/lib/api.ts', import.meta.url);
  url.searchParams.set('case', t.name);
  return { api: await import(url.href), expired: () => expired };
}

test('login prepara CSRF y envía credenciales normalizadas con cookies', async (t) => {
  const paths = [];
  const { api } = await client(t, (path, options) => {
    paths.push(path);
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf-1' });
    assert.equal(path, '/auth/login');
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-1');
    assert.deepEqual(JSON.parse(options.body), { email: 'admin@example.com', password: 'test-password' });
    return json({ user });
  });
  assert.deepEqual(await api.login(' ADMIN@EXAMPLE.COM ', 'test-password'), user);
  assert.deepEqual(paths, ['/auth/csrf', '/auth/login']);
});

test('login incorrecto no inicia refresh ni anuncia expiración', async (t) => {
  const { api, expired } = await client(t, (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    assert.equal(path, '/auth/login');
    return json({}, 401);
  });
  await assert.rejects(api.login(user.email, 'incorrecta'), (error) => error.status === 401);
  assert.equal(expired(), 0);
});

test('consultas simultáneas comparten una renovación de sesión', async (t) => {
  let renewed = false;
  let refreshCount = 0;
  const { api } = await client(t, async (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') {
      refreshCount += 1;
      await new Promise((resolve) => setImmediate(resolve));
      renewed = true;
      return json({ user });
    }
    return renewed ? json([]) : json({}, 401);
  });
  await Promise.all([api.getDashboardMotors(), api.getMotorHistory('motor', 'CURRENT')]);
  assert.equal(refreshCount, 1);
});

test('un 401 tardío reutiliza el refresh ya completado', async (t) => {
  const renewed = deferred();
  let motorsCalls = 0;
  let historyCalls = 0;
  let refreshCount = 0;
  const { api } = await client(t, async (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') { refreshCount += 1; return json({ user }); }
    if (path === '/dashboard/motors') {
      if (++motorsCalls === 1) return json({}, 401);
      renewed.resolve();
      return json([]);
    }
    if (++historyCalls === 1) { await renewed.promise; return json({}, 401); }
    return json([]);
  });
  await Promise.all([api.getDashboardMotors(), api.getMotorHistory('motor', 'CURRENT')]);
  assert.equal(refreshCount, 1);
});

test('refresh inválido expira la sesión sin reintentos infinitos', async (t) => {
  let refreshCount = 0;
  const { api, expired } = await client(t, (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') refreshCount += 1;
    return json({}, 401);
  });
  await assert.rejects(api.getCurrentUser(), (error) => error.status === 401);
  assert.equal(refreshCount, 1);
  assert.equal(expired(), 1);
});

test('fallo de red no se confunde con expiración de sesión', async (t) => {
  const { api, expired } = await client(t, () => { throw new TypeError('offline'); });
  await assert.rejects(api.getCurrentUser(), (error) => error.status === 0);
  assert.equal(expired(), 0);
});

test('CSRF desactualizado se regenera una sola vez', async (t) => {
  let csrfCount = 0;
  let loginCount = 0;
  const { api } = await client(t, (path, options) => {
    if (path === '/auth/csrf') return json({ csrfToken: `csrf-${++csrfCount}` });
    if (++loginCount === 1) return json({}, 403);
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-2');
    return json({ user });
  });
  await api.login(user.email, 'password');
  assert.equal(csrfCount, 2);
  assert.equal(loginCount, 2);
});

test('logout espera un refresh en curso y descarta consultas anteriores', async (t) => {
  const started = deferred();
  const release = deferred();
  let logoutCalls = 0;
  const { api, expired } = await client(t, async (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') {
      started.resolve();
      await release.promise;
      return json({ user });
    }
    if (path === '/auth/logout') { logoutCalls += 1; return new Response(null, { status: 204 }); }
    return json({}, 401);
  });
  const pending = assert.rejects(api.getDashboardMotors(), (error) => error.status === 401);
  await started.promise;
  const closing = api.logout();
  assert.equal(logoutCalls, 0);
  release.resolve();
  await Promise.all([pending, closing]);
  assert.equal(logoutCalls, 1);
  assert.equal(expired(), 0);
});

test('logout renueva un access token expirado y maneja respuesta 204', async (t) => {
  let logoutCalls = 0;
  let refreshCalls = 0;
  const { api } = await client(t, (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') { refreshCalls += 1; return json({ user }); }
    assert.equal(path, '/auth/logout');
    return ++logoutCalls === 1 ? json({}, 401) : new Response(null, { status: 204 });
  });
  await api.logout();
  assert.equal(logoutCalls, 2);
  assert.equal(refreshCalls, 1);
});


test('dos pestañas coordinan refresh con Web Locks y reutilizan las cookies renovadas', async (t) => {
  let renewed = false;
  let rotations = 0;
  const { api } = await client(t, async (path) => {
    if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
    if (path === '/auth/refresh') { rotations += 1; renewed = true; return json({ user }); }
    return renewed ? json({ user }) : json({}, 401);
  });
  let queue = Promise.resolve();
  navigator.locks = { request: (_name, work) => {
    const result = queue.then(work); queue = result.catch(() => {}); return result;
  } };
  const second = await import('../src/lib/api.ts?tab=second');
  await Promise.all([api.getCurrentUser(), second.getCurrentUser()]);
  assert.equal(rotations, 1);
});
