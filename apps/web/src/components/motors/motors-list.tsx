'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { getFleetMotors } from '@/lib/api';
import type { FleetMotorSummary } from '@/lib/types';
import { dateLabel, motorStates, motorTone } from './motor-labels';

export function MotorsList() {
  const { user, signOut } = useAuth();
  const [motors, setMotors] = useState<FleetMotorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    let alive = true;
    void getFleetMotors()
      .then((items) => {
        if (alive) { setMotors(items); setError(''); }
      })
      .catch((failure: unknown) => {
        if (alive) setError(failure instanceof Error ? failure.message : 'Error al consultar motores.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [revision]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return motors.filter((motor) => {
      if (status !== 'ALL' && motor.operationalStatus !== status) return false;
      return !q || [motor.name, motor.code, motor.plantName, motor.clientName]
        .some((value) => value.toLocaleLowerCase('es').includes(q));
    });
  }, [motors, search, status]);

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GROUNDTEK · INVENTARIO OPERATIVO</span>
            <h1>Mis motores</h1>
            <p>Fichas técnicas y estado de los equipos autorizados para tu sesión.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <div>
              <button className="refresh-button" type="button" disabled={loading}
                onClick={() => { setLoading(true); setRevision((n) => n + 1); }}>
                {loading ? 'Consultando…' : 'Actualizar'}
              </button>
              <button className="refresh-button" type="button" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <div className="fleet-toolbar">
          <label>Buscar motor, código, empresa o planta
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej. MOTOR-001" type="search" />
          </label>
          <label>Condición operativa
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">Todos los estados</option>
              {Object.entries(motorStates).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="panel fleet-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">FLOTA</span><h2>Inventario de motores</h2></div>
            <span>{filtered.length} de {motors.length} equipos</span>
          </div>
          {loading && motors.length === 0 ? (
            <p className="fleet-empty">Consultando equipos…</p>
          ) : !loading && filtered.length === 0 ? (
            <p className="fleet-empty">No hay motores que coincidan con los filtros o permisos de tu cuenta.</p>
          ) : (
            <div className="fleet-table-wrap">
              <table className="fleet-table">
                <thead><tr>
                  <th>Motor</th><th>Empresa y planta</th><th>Estado</th>
                  <th>Dispositivos</th><th>Alarmas abiertas</th><th>Última telemetría</th><th>Ficha</th>
                </tr></thead>
                <tbody>{filtered.map((motor) => (
                  <tr key={motor.id}>
                    <td><strong>{motor.name}</strong><small>{motor.code}</small></td>
                    <td>{motor.clientName}<small>{motor.plantName}</small></td>
                    <td><span className={`status-pill ${motorTone(motor.operationalStatus)}`}>
                      {motorStates[motor.operationalStatus] ?? motor.operationalStatus}</span></td>
                    <td>{motor.deviceCount}</td>
                    <td>{motor.activeAlarmCount}</td>
                    <td>{dateLabel(motor.lastTelemetryAt)}</td>
                    <td><Link className="fleet-link" href={`/motors/${motor.id}`}>Ver ficha</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
