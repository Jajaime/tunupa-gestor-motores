'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useLiveDashboard } from './use-live-dashboard';
import type {
  LatestMeasurement,
} from '@/lib/types';
import { RealtimeStatus } from './realtime-status';
import { TelemetryChart } from './telemetry-chart';
import { useAuth } from '@/components/auth/auth-provider';
import { summarizeMotorStates } from '@/lib/dashboard-status';


const measurements = [
  { type: 'TEMPERATURE', label: 'Temperatura', short: 'TEMP' },
  { type: 'CURRENT', label: 'Corriente', short: 'AMP' },
  { type: 'VIBRATION', label: 'Vibración', short: 'VIB' },
  { type: 'ROTATION_SPEED', label: 'Velocidad', short: 'RPM' },
  { type: 'VOLTAGE', label: 'Voltaje', short: 'VOLT' },
  { type: 'FREQUENCY', label: 'Frecuencia', short: 'HZ' },
] as const;

const statusLabels: Record<string, string> = {
  RUNNING: 'En línea',
  ONLINE: 'En línea',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítico',
  OFFLINE: 'Desconectado',
  UNKNOWN: 'Sin datos',
};

function statusTone(status: string): string {
  if (status === 'RUNNING' || status === 'ONLINE') return 'online';
  if (status === 'WARNING') return 'warning';
  if (status === 'CRITICAL') return 'critical';
  return 'offline';
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin telemetría';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function MeasurementCard({
  label,
  short,
  measurement,
}: {
  label: string;
  short: string;
  measurement?: LatestMeasurement;
}) {
  return (
    <article className="measurement-card">
      <div className="measurement-icon" aria-hidden="true">{short}</div>
      <div>
        <span className="eyebrow">{label}</span>
        <p className="measurement-value">
          {measurement ? measurement.value.toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '—'}
          {measurement && <small>{measurement.unit}</small>}
        </p>
      </div>
      <span className={`quality quality-${measurement?.quality.toLowerCase() ?? 'unknown'}`}>
        {measurement?.quality ?? 'SIN DATOS'}
      </span>
    </article>
  );
}

export function Dashboard() {
  const { user, error: sessionError, signOut } = useAuth();
  const { motors, selectedMotorId, selectedMeasurement, setSelectedMotorId,
    setSelectedMeasurement, history, loading, historyLoading, error, lastRefresh,
    apiConnection, realtimeStatus, refresh } = useLiveDashboard();

  const selectedMotor = useMemo(
    () => motors.find((motor) => motor.id === selectedMotorId) ?? null,
    [motors, selectedMotorId],
  );
  const summary = summarizeMotorStates(motors);
  const readingsAreStale = realtimeStatus !== 'connected' || apiConnection === 'disconnected'
    || selectedMotor?.operationalStatus === 'OFFLINE';
  const selectedMeasurementLabel =
    measurements.find(({ type }) => type === selectedMeasurement)?.label ?? selectedMeasurement;

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} apiConnection={apiConnection} lastRefresh={lastRefresh} />

      <section className="content" id="dashboard">
        <header className="topbar">
          <div>
            <span className="eyebrow">{user?.role === 'ADMIN' ? 'MONITOREO EN TIEMPO REAL' : 'PORTAL DEL CLIENTE'}</span>
            <h1>{user?.role === 'ADMIN' ? 'Estado de la operación' : 'Resumen de mis motores'}</h1>
            <p>{user?.role === 'ADMIN'
              ? 'Telemetría, condición y alarmas de los motores conectados.'
              : 'Lecturas, condición y alarmas de los equipos de tus empresas asignadas.'}</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <RealtimeStatus status={realtimeStatus} />
            <div>
              <button className="refresh-button" onClick={refresh} type="button">
                Actualizar
              </button>
              <button className="refresh-button" onClick={() => void signOut()} type="button">
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        {(error ?? sessionError) && (
          <div className="error-banner" role="alert">
            <span>{error ?? sessionError}</span>
            <button type="button" onClick={refresh}>Reintentar</button>
          </div>
        )}

        <section className="summary-grid" aria-label="Resumen de operación">
          <article><span>Total motores</span><strong>{motors.length}</strong><small>Registrados</small></article>
          <article><span>En línea</span><strong>{summary.online}</strong><small>Incluye equipos con alarmas</small></article>
          <article><span>Alarmas activas</span><strong className={summary.alarms ? 'text-alert' : ''}>{summary.alarms}</strong><small>Requieren revisión</small></article>
          <article><span>Desconectados</span><strong>{summary.offline}</strong><small>{summary.unknown ? `${summary.unknown} equipos adicionales sin datos` : 'Sin telemetría reciente'}</small></article>
        </section>

        <section className="panel" id="motors">
          <div className="panel-heading">
            <div><span className="eyebrow">FLOTA</span><h2>Motores monitoreados</h2></div>
            <span>{motors.length} equipos</span>
          </div>
          {loading ? (
            <div className="loading-block">Consultando motores…</div>
          ) : motors.length === 0 ? (
            <div className="loading-block">No hay motores registrados.</div>
          ) : (
            <div className="motor-list">
              {motors.map((motor) => (
                <button
                  className={`motor-row ${motor.id === selectedMotorId ? 'selected' : ''}`}
                  key={motor.id}
                  onClick={() => setSelectedMotorId(motor.id)}
                  type="button"
                >
                  <span className={`status-beacon ${statusTone(motor.operationalStatus)}`} />
                  <span className="motor-identity"><strong>{motor.name}</strong><small>{motor.code} · {motor.plantName}</small></span>
                  <span className={`status-pill ${statusTone(motor.operationalStatus)}`}>
                    {statusLabels[motor.operationalStatus] ?? motor.operationalStatus}
                  </span>
                  <span className="motor-device">{motor.device?.code ?? 'Sin dispositivo'}</span>
                  <span className="motor-time">{formatDate(motor.lastTelemetryAt)}</span>
                  <span className={`alarm-count ${motor.activeAlarmCount ? 'has-alarm' : ''}`}>
                    {motor.activeAlarmCount} alarmas
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedMotor && (
          <>
            <section className="section-heading">
              <div><span className="eyebrow">{selectedMotor.code}</span><h2>{readingsAreStale ? 'Últimos indicadores recibidos' : 'Indicadores actuales'}</h2></div>
              <div className="fleet-detail-jump">
                <span>Última lectura: {formatDate(selectedMotor.lastTelemetryAt)}</span>
                <Link href={`/motors/${selectedMotor.id}`}>Ver ficha técnica</Link>
              </div>
            </section>
            {readingsAreStale && (
              <p className="telemetry-notice" role="status">
                {apiConnection === 'disconnected'
                  ? 'No se puede actualizar la información. Se muestran las últimas lecturas guardadas.'
                  : selectedMotor.operationalStatus === 'OFFLINE'
                    ? 'Sin telemetría reciente. Se muestran las últimas lecturas guardadas.'
                    : 'Actualización en tiempo real interrumpida. Se muestran las últimas lecturas consultadas.'}
              </p>
            )}
            <section className="measurements-grid">
              {measurements.map(({ type, label, short }) => (
                <MeasurementCard key={type} label={label} short={short} measurement={selectedMotor.latestMeasurements[type]} />
              ))}
            </section>

            <section className="panel chart-panel" id="history">
              <div className="panel-heading chart-heading">
                <div><span className="eyebrow">TENDENCIA</span><h2>Histórico de {selectedMeasurementLabel.toLowerCase()}</h2></div>
                <select value={selectedMeasurement} onChange={(event) => setSelectedMeasurement(event.target.value)}>
                  {measurements.map(({ type, label }) => <option key={type} value={type}>{label}</option>)}
                </select>
              </div>
              {historyLoading && history.length === 0 ? (
                <div className="chart-empty">Cargando histórico…</div>
              ) : (
                <TelemetryChart data={history} unit={history[0]?.unit} />
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
