'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/components/auth/auth-provider';
import {
  changeAccountPassword, getAccountProfile, getAccountSessions,
  revokeAccountSession, revokeOtherAccountSessions,
} from '@/lib/api';
import type { AccountProfile, AccountSession } from '@/lib/api';

const roles: Record<string, string> = {
  ADMIN: 'Administrador TUNUPA', OPERATOR: 'Operador', VIEWER: 'Visualizador',
};
function dateLabel(value: string | null): string {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha desconocida' : date.toLocaleString('es-CL');
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

export function AccountPage() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let alive = true;
    void Promise.all([getAccountProfile(), getAccountSessions()])
      .then(([account, active]) => {
        if (!alive) return;
        setProfile(account); setSessions(active); setError('');
      })
      .catch((failure: unknown) => { if (alive) setError(message(failure)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function refreshSessions() {
    setSessions(await getAccountSessions());
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden.'); return;
    }
    if (newPassword.length < 14 || newPassword.length > 128) {
      setError('La contraseña nueva debe tener entre 14 y 128 caracteres.'); return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente a la actual.'); return;
    }
    setBusy(true);
    try {
      const result = await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      await Promise.all([refreshSessions(), getAccountProfile().then(setProfile)]);
      setNotice(`Contraseña actualizada. ${result.revokedSessions} sesiones adicionales cerradas.`);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function revokeOne(id: string) {
    if (busy || !sessions.some(session => session.id === id && !session.isCurrent)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await revokeAccountSession(id);
      await refreshSessions();
      setNotice('La sesión fue cerrada.');
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function revokeOthers() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await revokeOtherAccountSessions();
      await refreshSessions();
      setNotice(`${result.revokedSessions} sesiones adicionales cerradas.`);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  const otherCount = sessions.filter(session => !session.isCurrent).length;

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content tunupa-account">
        <header className="topbar">
          <div>
            <span className="eyebrow">TUNUPA DATA · SEGURIDAD</span>
            <h1>Mi cuenta</h1>
            <p>Consulta tus datos, actualiza la contraseña y administra las sesiones abiertas.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <button className="refresh-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <p className="account-notice" role="status">{notice}</p>}
        {loading ? <p className="account-muted" role="status">Consultando cuenta…</p> : (
          <div className="account-grid">
            <section className="panel account-panel" aria-label="Información personal">
              <div className="panel-heading"><h2>Datos de la cuenta</h2></div>
              <dl className="account-details">
                <div><dt>Nombre</dt><dd>{profile?.displayName ?? '—'}</dd></div>
                <div><dt>Correo</dt><dd>{profile?.email ?? user?.email ?? '—'}</dd></div>
                <div><dt>Rol</dt><dd>{roles[profile?.role ?? ''] ?? profile?.role ?? '—'}</dd></div>
                <div><dt>Último ingreso</dt><dd>{dateLabel(profile?.lastLoginAt ?? null)}</dd></div>
                <div><dt>Último cambio de contraseña</dt><dd>{dateLabel(profile?.passwordChangedAt ?? null)}</dd></div>
              </dl>
            </section>

            <section className="panel account-panel" aria-label="Cambiar contraseña">
              <div className="panel-heading"><h2>Cambiar contraseña</h2></div>
              <form className="account-password-form" onSubmit={(event) => void submitPassword(event)}>
                <label>Contraseña actual
                  <input type="password" required autoComplete="current-password" maxLength={128}
                    value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                </label>
                <label>Nueva contraseña (mínimo 14 caracteres)
                  <input type="password" required autoComplete="new-password" minLength={14} maxLength={128}
                    value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </label>
                <label>Confirmar contraseña nueva
                  <input type="password" required autoComplete="new-password" minLength={14} maxLength={128}
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </label>
                <p className="account-muted">Al cambiarla, se cerrarán las demás sesiones, pero esta permanecerá abierta.</p>
                <button className="auth-submit" disabled={busy} type="submit">
                  {busy ? 'Procesando…' : 'Actualizar contraseña'}
                </button>
              </form>
            </section>

            <section className="panel account-panel account-sessions" aria-label="Sesiones activas">
              <div className="panel-heading">
                <div><h2>Sesiones activas</h2><p className="account-muted">Hasta 100 sesiones recientes, incluyendo esta sesión.</p></div>
                <button type="button" className="refresh-button" disabled={busy || otherCount === 0}
                  onClick={() => void revokeOthers()}>Cerrar otras sesiones ({otherCount})</button>
              </div>
              {sessions.length === 0 ? <p className="account-muted">No se encontraron sesiones activas.</p> : (
                <div className="account-session-list">
                  {sessions.map(session => <article key={session.id} className="account-session-item">
                    <div>
                      <strong>{session.isCurrent ? 'Esta sesión' : 'Otra sesión'}</strong>
                      <p>{session.userAgent || 'Dispositivo no identificado'}</p>
                      <small>Iniciada: {dateLabel(session.createdAt)} · Vence: {dateLabel(session.expiresAt)}</small>
                      {session.ipAddress && <small>IP de conexión: {session.ipAddress}</small>}
                    </div>
                    {session.isCurrent ? <span className="account-current">Actual</span> : (
                      <button type="button" className="refresh-button" disabled={busy}
                        onClick={() => void revokeOne(session.id)}>Cerrar</button>
                    )}
                  </article>)}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
