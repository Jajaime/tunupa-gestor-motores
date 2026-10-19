'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { status, error, checkSession } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [router, status]);
  if (status === 'authenticated') return children;
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-live="polite">
        <span className="brand-mark">T</span>
        <h1>{status === 'unavailable' ? 'No pudimos conectar' : 'Comprobando sesión…'}</h1>
        <p>{error ?? 'Un momento mientras preparamos tu acceso.'}</p>
        {status === 'unavailable' && (
          <button className="auth-submit" onClick={() => void checkSession()} type="button">
            Reintentar conexión
          </button>
        )}
      </section>
    </main>
  );
}
