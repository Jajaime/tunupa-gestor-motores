'use client';

import { Fragment, useEffect, useState } from 'react';
import './alarms-inline.css';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { acknowledgeAlarm, getAlarm, getAlarms } from '@/lib/api';
import type { AlarmDetail, AlarmRecord, AlarmsQuery } from '@/lib/types';
import { alarmDate, alarmEvent, alarmSeverity, alarmStatus } from './alarm-labels';

const pageSize = 50;

function dateBoundary(value: string, end: boolean): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la consulta.';
}

export function AlarmsPage() {
  const { user, signOut } = useAuth();
  const [rows, setRows] = useState<AlarmRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlarmDetail | null>(null);

  useEffect(() => {
    let alive = true;
    const filters: AlarmsQuery = {
      status: status || undefined,
      severity: severity || undefined,
      from: dateBoundary(from, false),
      to: dateBoundary(to, true),
      limit: pageSize,
      offset: page * pageSize,
    };
    void getAlarms(filters).then((result) => {
      if (!alive) return;
      setRows(result.items);
      setHasMore(result.hasMore);
      setError('');
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, severity, from, to, page, revision]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void getAlarm(selectedId).then((result) => {
      if (alive) { setDetail(result); setError(''); }
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    }).finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedId, revision]);

  function resetSelection() {
    setSelectedId(null);
    setDetail(null);
    setNotice('');
  }

  async function acknowledge(id: string) {
    if (busy || (user?.role !== 'ADMIN' && user?.role !== 'OPERATOR')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const changed = await acknowledgeAlarm(id);
      setDetail(changed);
      setNotice('Alarma reconocida. La resolución depende de que las mediciones vuelvan a la normalidad.');
      setRevision((n) => n + 1);
    } catch (failure) {
      setError(errorMessage(failure));
      setRevision((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const selected = detail?.id === selectedId ? detail : null;
  const canAcknowledge = user?.role === 'ADMIN' || user?.role === 'OPERATOR';

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GROUNDTEK · SEGUIMIENTO OPERATIVO</span>
            <h1>Alarmas y eventos</h1>
            <p>Alertas, historial de estados y gestiones de tus motores autorizados.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <div>
              <button type="button" className="refresh-button" disabled={loading || busy}
                onClick={() => { setLoading(true); setDetailLoading(Boolean(selectedId)); setRevision((n) => n + 1); }}>
                Actualizar
              </button>
              <button type="button" className="refresh-button" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <p className="alarms-notice" role="status">{notice}</p>}

        <div className="alarms-filters">
          <label>Estado
            <select value={status} onChange={(e) => {
              resetSelection(); setStatus(e.target.value); setPage(0); setLoading(true);
            }}>
              <option value="">Todos los estados</option>
              {Object.entries(alarmStatus).map(([key, name]) =>
                <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
          <label>Severidad
            <select value={severity} onChange={(e) => {
              resetSelection(); setSeverity(e.target.value); setPage(0); setLoading(true);
            }}>
              <option value="">Todas las severidades</option>
              {Object.entries(alarmSeverity).map(([key, name]) =>
                <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
          <label>Desde
            <input type="date" value={from} max={to || undefined} onChange={(e) => {
              resetSelection(); setFrom(e.target.value); setPage(0); setLoading(true);
            }} />
          </label>
          <label>Hasta
            <input type="date" value={to} min={from || undefined} onChange={(e) => {
              resetSelection(); setTo(e.target.value); setPage(0); setLoading(true);
            }} />
          </label>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">HISTÓRICO</span><h2>Alertas registradas</h2></div>
            <span>Página {page + 1}</span>
          </div>
          {loading ? <p className="fleet-empty">Consultando alarmas…</p>
            : rows.length === 0 ? <p className="fleet-empty">No hay alarmas para los filtros seleccionados.</p>
              : <div className="fleet-table-wrap"><table className="fleet-table">
                <thead><tr><th>Inicio</th><th>Motor</th><th>Tipo</th>
                  <th>Severidad</th><th>Estado</th><th>Detalle</th></tr></thead>
                <tbody>{rows.map((alarm) => (
                  <Fragment key={alarm.id}>
                  <tr className={selectedId === alarm.id ? 'alarms-active-record' : undefined}>
                    <td>{alarmDate(alarm.startedAt)}</td>
                    <td><strong>{alarm.motorName}</strong><small>{alarm.clientName} · {alarm.plantName}</small></td>
                    <td>{alarm.alarmType}</td>
                    <td><span className={`alarms-pill ${alarm.severity.toLowerCase()}`}>
                      {alarmSeverity[alarm.severity] ?? alarm.severity}</span></td>
                    <td>{alarmStatus[alarm.status] ?? alarm.status}</td>
                    <td><button type="button" className="fleet-link alarms-detail-button"
                      aria-controls={selectedId === alarm.id ? `alarm-detail-${alarm.id}` : undefined}
                      aria-expanded={selectedId === alarm.id} onClick={() => {
                        if (selectedId === alarm.id) {
                          resetSelection();
                          return;
                        }
                        setDetail(null);
                        setSelectedId(alarm.id);
                        setDetailLoading(true);
                        setError('');
                        setNotice('');
                      }}>{selectedId === alarm.id ? 'Ocultar detalle' : 'Ver detalle y eventos'}</button></td>
                  </tr>
                  {selectedId === alarm.id && (
                    <tr className="alarms-inline-row">
                      <td colSpan={6} className="alarms-inline-cell">
                        <section id={`alarm-detail-${alarm.id}`}
                          className="alarms-detail alarms-inline-detail" aria-label="Detalle de alarma">
                          <div className="panel-heading">
                            <div><span className="eyebrow">TRAZABILIDAD</span><h2>Detalle e historial</h2></div>
                            <button type="button" className="refresh-button" onClick={resetSelection}>Cerrar detalle</button>
                          </div>
                          {detailLoading ? <p className="fleet-empty">Consultando eventos…</p>
                            : !selected ? <p className="fleet-empty">No fue posible cargar el detalle.</p> : <>
                            <div className="alarms-detail-grid">
                              <div><small>Motor</small><strong><Link href={`/motors/${selected.motorId}`}>
                                {selected.motorName} ({selected.motorCode})</Link></strong></div>
                              <div><small>Estado</small><strong>{alarmStatus[selected.status] ?? selected.status}</strong></div>
                              <div><small>Valor medido / umbral</small><strong>
                                {selected.measuredValue ?? '—'} / {selected.thresholdValue ?? '—'} {selected.unit ?? ''}
                              </strong></div>
                              <div><small>Reconocida</small><strong>{alarmDate(selected.acknowledgedAt)}</strong></div>
                              <div><small>Resuelta</small><strong>{alarmDate(selected.resolvedAt)}</strong></div>
                            </div>
                            <p className="alarms-message">{selected.message}</p>
                            {canAcknowledge && selected.status === 'ACTIVE' && (
                              <button className="auth-submit alarms-ack" type="button" disabled={busy}
                                onClick={() => void acknowledge(selected.id)}>
                                {busy ? 'Registrando…' : 'Reconocer alarma'}
                              </button>
                            )}
                            <p className="admin-muted">Reconocer confirma la atención, pero no cierra ni borra la alerta.
                              La resolución se registra cuando la telemetría confirma la recuperación.</p>
                            <h3>Historial de eventos</h3>
                            {selected.events.length === 0 ? <p>Sin eventos registrados.</p>
                              : <ol className="alarms-timeline">{selected.events.map((entry) => (
                                <li key={entry.id}>
                                  <strong>{alarmEvent[entry.eventType] ?? entry.eventType}</strong>
                                  <span>{alarmDate(entry.occurredAt)} · {entry.actorName ?? 'Sistema'}</span>
                                  <small>{entry.previousStatus ? `${alarmStatus[entry.previousStatus] ?? entry.previousStatus} → ` : ''}
                                    {alarmStatus[entry.currentStatus] ?? entry.currentStatus}</small>
                                </li>
                              ))}</ol>}
                          </>}
                        </section>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}</tbody>
              </table></div>}
          <div className="alarms-pager">
            <button className="refresh-button" type="button" disabled={loading || page === 0}
              onClick={() => { resetSelection(); setPage((n) => n - 1); setLoading(true); }}>Anterior</button>
            <button className="refresh-button" type="button" disabled={loading || !hasMore}
              onClick={() => { resetSelection(); setPage((n) => n + 1); setLoading(true); }}>Siguiente</button>
          </div>
        </section>

      </section>
    </main>
  );
}
