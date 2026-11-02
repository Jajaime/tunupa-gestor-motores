import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const login = read('src/components/auth/login-panel.tsx');
const theme = read('src/styles/tunupa-login.css');
const layout = read('src/app/layout.tsx');

test('login utiliza los logotipos oficiales TUNUPA sin el PNG anterior', () => {
  assert.match(login, /\/brand\/tunupa\/logo-horizontal-light\.svg/);
  assert.match(login, /\/brand\/tunupa\/symbol-orange\.svg/);
  assert.doesNotMatch(login, /groundtek-logo\.png/);
  assert.match(login, /GroundTEK/);
});

test('mantiene autenticación, errores, validación de inputs y redirección', () => {
  for (const part of [
    'useAuth()', 'await signIn(email, password)', "router.replace('/')",
    "status === 'checking'", "status === 'authenticated'", 'event.preventDefault()',
    'if (busy) return', 'setPassword(\'\')', 'role="alert"', 'role="status"',
    'fieldset disabled={busy}', 'form onSubmit={submit}', 'autoComplete="username"',
    'autoComplete="current-password"', 'type="email"', 'type="password"', 'required value={email}', 'required value={password}',
  ]) assert.ok(login.includes(part), `Contrato de autenticación faltante: ${part}`);
});

test('ilustración volcánica es decorativa, sin imágenes o peticiones externas', () => {
  assert.match(login, /tunupa-login-landscape" aria-hidden="true"/);
  assert.match(theme, /\.tunupa-login-mountain-far/);
  assert.match(theme, /\.tunupa-login-mountain-near/);
  assert.match(theme, /var\(--tunupa-brown\)/);
  assert.match(theme, /var\(--tunupa-orange-light\)/);
  assert.doesNotMatch(theme, /url\(|@import|https?:\/\//);
});

test('tema login está aislado, es responsive y se carga después del tema anterior', () => {
  assert.ok(layout.indexOf("import '../styles/tunupa-login.css';") > layout.indexOf("import '../styles/tunupa-sidebar.css';"));
  assert.match(theme, /\.auth-screen\.tunupa-login/);
  assert.match(theme, /\.auth-card\.tunupa-login-card/);
  assert.match(theme, /@media \(max-width: 720px\)/);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(theme, /\.status-pill|\.live-dot|\.status-beacon|\.realtime-connected/);
});

test('login cabe en la altura visible de escritorio sin bloquear scroll accesible', () => {
  const compact = theme.slice(theme.indexOf('/* Ajuste del login en escritorio/notebook'));
  assert.match(compact, /@media \(min-width: 721px\)/);
  assert.match(compact, /height:\s*100dvh/);
  assert.match(compact, /height:\s*min\(710px, calc\(100dvh/);
  assert.match(compact, /\.tunupa-login-story-copy\s*\{\s*margin-top:\s*clamp/);
  assert.match(compact, /\.tunupa-login-story-foot\s*\{\s*padding-top:\s*clamp/);
  assert.match(compact, /overflow-y:\s*auto/);
  assert.doesNotMatch(compact, /(?:html|body)\s*\{|overflow:\s*hidden/);
  assert.match(theme, /@media \(max-width: 720px\)/);
});
