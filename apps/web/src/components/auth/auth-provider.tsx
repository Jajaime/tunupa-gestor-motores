'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, getCurrentUser, login, logout, SESSION_EXPIRED_EVENT } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible comprobar la sesión.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(0);
  const hadSession = useRef(false);

  const checkSession = useCallback(async () => {
    const current = ++operation.current;
    setStatus('checking');
    setError(null);
    try {
      const result = await getCurrentUser();
      if (current !== operation.current) return;
      hadSession.current = true;
      setUser(result);
      setStatus('authenticated');
    } catch (requestError) {
      if (current !== operation.current) return;
      setUser(null);
      if (requestError instanceof ApiError && requestError.status === 401) {
        hadSession.current = false;
        setStatus('anonymous');
      } else {
        setStatus('unavailable');
        setError(message(requestError));
      }
    }
  }, []);

  useEffect(() => {
    const onExpired = () => {
      const expiredMessage = hadSession.current ? 'La sesión expiró. Inicia sesión nuevamente.' : null;
      hadSession.current = false;
      operation.current += 1;
      setUser(null);
      setStatus('anonymous');
      setError((current) => expiredMessage ?? current);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    const timer = window.setTimeout(() => void checkSession(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      operation.current += 1;
    };
  }, [checkSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const current = ++operation.current;
    const result = await login(email, password);
    if (current !== operation.current) return;
    hadSession.current = true;
    setUser(result);
    setStatus('authenticated');
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    const current = ++operation.current;
    setStatus('checking');
    setError(null);
    try {
      await logout();
      if (current !== operation.current) return;
      hadSession.current = false;
      setUser(null);
      setStatus('anonymous');
    } catch (requestError) {
      // Un fallo de red no confirma que el servidor haya cerrado la sesión.
      await checkSession();
      setError(`No pudimos confirmar el cierre de sesión. ${message(requestError)}`);
    }
  }, [checkSession]);

  return (
    <AuthContext.Provider value={{ user, status, error, checkSession, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requiere AuthProvider.');
  return context;
}
