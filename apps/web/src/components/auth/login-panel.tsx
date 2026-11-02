'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

export function LoginPanel() {
  const { status, error: sessionError, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [router, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible iniciar sesión.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking' || status === 'authenticated') {
    return (
      <main className="auth-screen tunupa-login tunupa-login-pending">
        <Image src="/brand/tunupa/symbol-orange.svg" width={58} height={50}
          alt="" aria-hidden="true" priority />
        <p role="status">Comprobando sesión…</p>
      </main>
    );
  }

  return (
    <main className="auth-screen tunupa-login">
      <div className="tunupa-login-shell">
        <aside className="tunupa-login-story" aria-label="Presentación de TUNUPA">
          <Image src="/brand/tunupa/logo-horizontal-light.svg" alt="TUNUPA — Gestor de motores"
            width={895} height={228} className="tunupa-login-wordmark" priority />
          <div className="tunupa-login-story-copy">
            <span className="tunupa-login-kicker">MONITOREO INDUSTRIAL</span>
            <h2>La energía de tus operaciones, bajo control.</h2>
            <p>Monitorea tus motores eléctricos, consulta mediciones y gestiona alarmas desde una sola plataforma.</p>
          </div>
          <div className="tunupa-login-landscape" aria-hidden="true">
            <span className="tunupa-login-sun" />
            <span className="tunupa-login-mountain-far" />
            <span className="tunupa-login-mountain-near" />
          </div>
          <div className="tunupa-login-story-foot">Inspirado en la fuerza del volcán Tunupa</div>
        </aside>

        <section className="auth-card tunupa-login-card" aria-labelledby="login-title">
          <div className="tunupa-login-card-head">
            <Image src="/brand/tunupa/symbol-orange.svg" alt="" aria-hidden="true"
              width={235} height={204} className="tunupa-login-symbol" />
            <span>TUNUPA <small>ACCESO A LA PLATAFORMA</small></span>
          </div>
          <span className="eyebrow">BIENVENIDO</span>
          <h1 id="login-title">Inicia sesión</h1>
          <p>Ingresa con tus credenciales para acceder al monitoreo de tus motores.</p>
          {(error ?? sessionError) && (
            <div className="auth-error" role="alert">{error ?? sessionError}</div>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <label htmlFor="login-email">Correo electrónico</label>
              <input id="login-email" name="email" type="email" autoComplete="username"
                maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="login-password">Contraseña</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password"
                required value={password} onChange={(event) => setPassword(event.target.value)} />
              <button className="auth-submit" type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button>
            </fieldset>
          </form>
          <div className="tunupa-login-helper">Acceso exclusivo para usuarios autorizados.</div>
          <div className="tunupa-login-credit">Un desarrollo de <strong>GroundTEK</strong> Power Systems</div>
        </section>
      </div>
    </main>
  );
}
