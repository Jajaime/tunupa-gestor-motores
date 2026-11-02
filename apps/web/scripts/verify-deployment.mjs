#!/usr/bin/env node
/**
 * TUNUPA Patch 09: smoke test público (solo GET, sin credenciales ni cambios de estado).
 * Uso: npm --prefix apps/web run verify:deployment -- --base-url http://127.0.0.1:8080
 * Para HTTPS del VPS: --base-url https://app.tunupadata.cl
 * --check-api incluye /api/v1/health (según Caddy); no prueba sesión autenticada.
 */
import { pathToFileURL } from 'node:url';

const CHECKS = [
  { path: '/login', type: /text\/html/i, body: /TUNUPA/i },
  { path: '/favicon.ico', type: /image\/(?:x-icon|vnd\.microsoft\.icon)/i },
  { path: '/icon.svg', type: /image\/svg\+xml/i, body: /<svg[\s>]/i },
  { path: '/apple-icon.png', type: /image\/png/i },
  { path: '/manifest.webmanifest', type: /(?:application\/(?:manifest\+json|json))/i, manifest: true },
  { path: '/brand/tunupa/logo-horizontal-light.svg', type: /image\/svg\+xml/i, body: /<svg[\s>]/i },
];

export function parseBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL base inválida'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Usa la URL de origen, sin credenciales, path, query ni fragmento');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error('HTTP solo permitido en localhost; para VPS usa HTTPS');
  }
  return url;
}

export async function verifyDeployment(baseUrl, { fetchImpl = fetch, checkApi = false } = {}) {
  const origin = parseBaseUrl(baseUrl).origin;
  const checks = checkApi ? [...CHECKS, { path: '/api/v1/health', type: /application\/json/i }] : CHECKS;
  const results = [];
  for (const check of checks) {
    try {
      const response = await fetchImpl(origin + check.path, {
        method: 'GET', redirect: 'manual', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') ?? '';
      if (!check.type.test(contentType)) throw new Error(`Content-Type inesperado: ${contentType || 'ausente'}`);
      if (check.body || check.manifest) {
        const body = await response.text();
        if (check.body && !check.body.test(body)) throw new Error('Contenido de marca no encontrado');
        if (check.manifest) {
          const manifest = JSON.parse(body);
          if (!/tunupa/i.test(`${manifest.name ?? ''} ${manifest.short_name ?? ''}`)) throw new Error('Manifest sin marca TUNUPA');
          const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
          if (!icons.some(icon => icon.sizes?.includes('192x192')) || !icons.some(icon => icon.sizes?.includes('512x512'))) {
            throw new Error('Manifest sin iconos 192 y 512');
          }
        }
      }
      results.push({ path: check.path, ok: true });
    } catch (error) {
      results.push({ path: check.path, ok: false, reason: error instanceof Error ? error.message : 'Fallo desconocido' });
    }
  }
  return results;
}

export function parseArgs(argv) {
  let baseUrl;
  let checkApi = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url' && argv[i+1]) baseUrl = argv[++i];
    else if (argv[i] === '--check-api') checkApi = true;
    else throw new Error(`Argumento no reconocido: ${argv[i]}`);
  }
  if (!baseUrl) throw new Error('Falta --base-url (ej.: http://127.0.0.1:8080)');
  parseBaseUrl(baseUrl);
  return { baseUrl, checkApi };
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    const results = await verifyDeployment(options.baseUrl, options);
    for (const item of results) {
      console.log(`${item.ok ? 'OK' : 'ERROR'} ${item.path}${item.ok ? '' : ': ' + item.reason}`);
    }
    if (results.some(item => !item.ok)) {
      console.error('Validación pública incompleta: revisar respuestas antes del despliegue.');
      return 1;
    }
    console.log('Comprobación de rutas públicas TUNUPA correcta. Validar también login real y telemetría manualmente.');
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
