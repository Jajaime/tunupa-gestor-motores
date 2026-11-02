import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBaseUrl, parseArgs, verifyDeployment } from '../scripts/verify-deployment.mjs';

const manifest = JSON.stringify({ name: 'TUNUPA — Gestor de motores', icons: [
  { src: '/brand/tunupa/app-icon-192.png', sizes: '192x192' },
  { src: '/brand/tunupa/app-icon-512.png', sizes: '512x512' },
] });
const responseFor = (url) => {
  const { pathname } = new URL(url);
  const sources = {
    '/login': ['<html><title>TUNUPA</title></html>', 'text/html'],
    '/favicon.ico': ['', 'image/x-icon'],
    '/icon.svg': ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml'],
    '/apple-icon.png': ['', 'image/png'],
    '/manifest.webmanifest': [manifest, 'application/manifest+json'],
    '/brand/tunupa/logo-horizontal-light.svg': ['<svg></svg>', 'image/svg+xml'],
    '/api/v1/health': ['{"status":"ok"}', 'application/json'],
  };
  const [body, contentType] = sources[pathname] ?? ['', 'text/plain'];
  return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
};

test('origen restringido a localhost HTTP o HTTPS, sin credenciales', () => {
  assert.equal(parseBaseUrl('http://127.0.0.1:8080').origin, 'http://127.0.0.1:8080');
  assert.equal(parseBaseUrl('https://app.tunupadata.cl').origin, 'https://app.tunupadata.cl');
  for (const value of ['http://example.com', 'ftp://localhost', 'https://u:p@example.com', 'https://example.com/login', 'https://example.com/?token=x']) {
    assert.throws(() => parseBaseUrl(value));
  }
});

test('revisa todas las rutas públicas del frontend sin autenticación', async () => {
  const requested = [];
  const results = await verifyDeployment('http://localhost:8080', {
    fetchImpl: async (url, options) => { requested.push(new URL(url).pathname); assert.equal(options.method, 'GET'); return responseFor(url); },
  });
  assert.equal(results.length, 6);
  assert.ok(results.every(x => x.ok));
  assert.ok(requested.includes('/manifest.webmanifest'));
});

test('opción check-api comprueba el proxy Caddy sin iniciar sesión', async () => {
  const results = await verifyDeployment('https://app.tunupadata.cl', { checkApi: true, fetchImpl: responseFor });
  assert.equal(results.length, 7);
  assert.ok(results.every(x => x.ok));
  assert.deepEqual(parseArgs(['--base-url', 'http://localhost:8080', '--check-api']), { baseUrl: 'http://localhost:8080', checkApi: true });
});

test('no acepta respuestas incorrectas ni manifiestos incompletos', async () => {
  const wrongCode = await verifyDeployment('http://localhost:8080', { fetchImpl: async () => new Response('', { status: 404 }) });
  assert.ok(wrongCode.every(x => !x.ok));
  const badManifest = await verifyDeployment('http://localhost:8080', { fetchImpl: (url) =>
    new URL(url).pathname === '/manifest.webmanifest' ? new Response('{}', { headers: { 'Content-Type': 'application/manifest+json' } }) : responseFor(url),
  });
  assert.equal(badManifest.find(x => x.path === '/manifest.webmanifest')?.ok, false);
});

test('no permite argumentos extras ni omitir el origen', () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(['--base-url', 'http://localhost:8080', '--dangerous']));
});
