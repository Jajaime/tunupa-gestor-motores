'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
    return <main className="auth-screen"><p role="status">Comprobando sesión…</p></main>;
  }
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">
          <Image src="/brand/groundtek-logo.png" alt="GroundTEK" width={298} height={40}
            className="auth-logo" priority />
        </div>
        <span className="eyebrow">GESTOR DE MOTORES</span>
        <h1 id="login-title">Inicia sesión</h1>
        <p>Accede al monitoreo de motores y consulta su condición.</p>
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
      </section>
    </main>
  );
}
