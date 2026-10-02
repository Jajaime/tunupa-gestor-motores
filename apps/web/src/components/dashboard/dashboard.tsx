'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboardMotors, getMotorHistory } from '@/lib/api';
import type {
  DashboardMotorSummary,
  LatestMeasurement,
  TelemetryHistoryPoint,
} from '@/lib/types';
import { TelemetryChart } from './telemetry-chart';

const REFRESH_INTERVAL_MS = 5_000;

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
  const [motors, setMotors] = useState<DashboardMotorSummary[]>([]);
  const [selectedMotorId, setSelectedMotorId] = useState<string>('');
  const [selectedMeasurement, setSelectedMeasurement] =
    useState<string>('TEMPERATURE');
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadMotors = useCallback(async () => {
    try {
      const result = await getDashboardMotors();
      setMotors(result);
      setSelectedMotorId((current) =>
        result.some((motor) => motor.id === current) ? current : (result[0]?.id ?? ''),
      );
      setLastRefresh(new Date());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible consultar la API.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!selectedMotorId) return;
    setHistoryLoading(true);
    try {
      const result = await getMotorHistory(selectedMotorId, selectedMeasurement);
      setHistory(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el histórico.');
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedMeasurement, selectedMotorId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMotors(), 0);
    const timer = window.setInterval(() => void loadMotors(), REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadMotors]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadHistory(), 0);
    const timer = window.setInterval(() => void loadHistory(), REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadHistory]);

  const selectedMotor = useMemo(
    () => motors.find((motor) => motor.id === selectedMotorId) ?? null,
    [motors, selectedMotorId],
  );
  const onlineCount = motors.filter((motor) =>
    ['RUNNING', 'ONLINE'].includes(motor.operationalStatus),
  ).length;
  const alarmCount = motors.reduce((total, motor) => total + motor.activeAlarmCount, 0);
  const selectedMeasurementLabel =
    measurements.find(({ type }) => type === selectedMeasurement)?.label ?? selectedMeasurement;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div><strong>Tunupa</strong><small>Gestor de motores</small></div>
        </div>
        <nav aria-label="Navegación principal">
          <a className="nav-item active" href="#dashboard">Panel general</a>
          <a className="nav-item" href="#motors">Motores</a>
          <a className="nav-item" href="#history">Histórico</a>
        </nav>
        <div className="sidebar-footer">
          <span className="live-dot" /> API conectada
          <small>{lastRefresh ? `Actualizado ${lastRefresh.toLocaleTimeString('es-CL')}` : 'Conectando…'}</small>
        </div>
      </aside>

      <section className="content" id="dashboard">
        <header className="topbar">
          <div>
            <span className="eyebrow">MONITOREO EN TIEMPO REAL</span>
            <h1>Estado de la operación</h1>
            <p>Telemetría, condición y alarmas de los motores conectados.</p>
          </div>
          <button className="refresh-button" onClick={() => void loadMotors()} type="button">
            Actualizar
          </button>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error} Verifica que la API esté activa en el puerto 3001.</span>
            <button type="button" onClick={() => void loadMotors()}>Reintentar</button>
          </div>
        )}

        <section className="summary-grid" aria-label="Resumen de operación">
          <article><span>Total motores</span><strong>{motors.length}</strong><small>Registrados</small></article>
          <article><span>En línea</span><strong>{onlineCount}</strong><small>Transmitiendo datos</small></article>
          <article><span>Alarmas activas</span><strong className={alarmCount ? 'text-alert' : ''}>{alarmCount}</strong><small>Requieren revisión</small></article>
          <article><span>Desconectados</span><strong>{motors.length - onlineCount}</strong><small>Sin transmisión</small></article>
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
              <div><span className="eyebrow">{selectedMotor.code}</span><h2>Indicadores actuales</h2></div>
              <span>Última lectura: {formatDate(selectedMotor.lastTelemetryAt)}</span>
            </section>
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
