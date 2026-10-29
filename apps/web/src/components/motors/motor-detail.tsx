'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { getFleetMotor } from '@/lib/api';
import type { FleetMotorDetail } from '@/lib/types';
import { dateLabel, measurementNames, motorStates, motorTone } from './motor-labels';

function numberLabel(value: number | null, unit: string): string {
  if (value === null) return 'Sin especificar';
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 3 })} ${unit}`;
}

export function MotorDetail({ motorId }: { motorId: string }) {
  const { user, signOut } = useAuth();
  const [motor, setMotor] = useState<FleetMotorDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    void getFleetMotor(motorId)
      .then((result) => {
        if (alive) { setMotor(result); setError(''); }
      })
      .catch((failure: unknown) => {
        if (alive) setError(failure instanceof Error ? failure.message : 'Error al consultar el motor.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [motorId, revision]);

  const record = motor?.id === motorId ? motor : null;
  const readings = record ? Object.entries(record.latestMeasurements)
    .sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content">
        <header className="topbar">
          <div>
            <Link className="fleet-back" href="/motors">← Volver a Mis motores</Link>
            <span className="eyebrow">GROUNDTEK · FICHA INDIVIDUAL</span>
            <h1>{record?.name ?? 'Ficha del motor'}</h1>
            <p>{record ? `${record.clientName} · ${record.plantName} · ${record.code}`
              : 'Consulta de datos técnicos y operación.'}</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <div>
              <button type="button" className="refresh-button" disabled={loading}
                onClick={() => { setLoading(true); setRevision((n) => n + 1); }}>
                {loading ? 'Consultando…' : 'Actualizar'}
              </button>
              <button type="button" className="refresh-button" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {!record && !error && <section className="panel fleet-empty" aria-live="polite">
          Consultando ficha técnica…
        </section>}

        {record && (
          <>
            <section className="fleet-detail-summary" aria-label="Resumen del motor">
              <article className="panel"><span>Condición</span><strong className={`fleet-condition ${motorTone(record.operationalStatus)}`}>
                {motorStates[record.operationalStatus] ?? record.operationalStatus}</strong></article>
              <article className="panel"><span>Estado de registro</span><strong>{record.status}</strong></article>
              <article className="panel"><span>Alarmas abiertas</span><strong>{record.activeAlarmCount}</strong></article>
              <article className="panel"><span>Última telemetría</span><strong className="fleet-date">
                {dateLabel(record.lastTelemetryAt)}</strong></article>
            </section>

            {(record.operationalStatus === 'OFFLINE' || record.operationalStatus === 'UNKNOWN') && (
              <p className="telemetry-notice" role="status">
                Las mediciones corresponden al último registro disponible; no se garantiza una lectura en vivo.
              </p>
            )}

            <section className="panel fleet-detail-panel">
              <div className="panel-heading"><h2>Información técnica</h2><span>{record.code}</span></div>
              <dl className="fleet-specs">
                <div><dt>Fabricante</dt><dd>{record.manufacturer || 'Sin especificar'}</dd></div>
                <div><dt>Modelo</dt><dd>{record.model || 'Sin especificar'}</dd></div>
                <div><dt>Número de serie</dt><dd>{record.serialNumber || 'Sin especificar'}</dd></div>
                <div><dt>Potencia nominal</dt><dd>{numberLabel(record.ratedPowerKw, 'kW')}</dd></div>
                <div><dt>Voltaje nominal</dt><dd>{numberLabel(record.ratedVoltage, 'V')}</dd></div>
                <div><dt>Corriente nominal</dt><dd>{numberLabel(record.ratedCurrent, 'A')}</dd></div>
                <div><dt>Frecuencia nominal</dt><dd>{numberLabel(record.ratedFrequencyHz, 'Hz')}</dd></div>
                <div><dt>Ubicación</dt><dd>{record.plantLocation || record.plantName}</dd></div>
              </dl>
            </section>

            <section className="panel fleet-detail-panel">
              <div className="panel-heading"><h2>Dispositivos asociados</h2><span>{record.devices.length}</span></div>
              {record.devices.length === 0 ? <p className="fleet-empty">Este motor no tiene dispositivos asociados.</p>
                : <div className="fleet-table-wrap"><table className="fleet-table">
                  <thead><tr><th>Dispositivo</th><th>Comunicación</th><th>Estado</th>
                    <th>Firmware</th><th>Última conexión</th><th>Último ingreso de datos</th></tr></thead>
                  <tbody>{record.devices.map((device) => (
                    <tr key={device.id}>
                      <td><strong>{device.name}</strong><small>{device.code}</small>
                        {device.serialNumber && <small>Serie: {device.serialNumber}</small>}</td>
                      <td>{device.communicationType}</td><td>{device.status}</td>
                      <td>{device.firmwareVersion || '—'}</td>
                      <td>{dateLabel(device.lastConnectionAt)}</td>
                      <td>{dateLabel(device.lastTelemetryReceivedAt)}</td>
                    </tr>
                  ))}</tbody>
                </table></div>}
            </section>

            <section className="panel fleet-detail-panel">
              <div className="panel-heading"><div><span className="eyebrow">TELEMETRÍA</span>
                <h2>Últimas mediciones recibidas</h2></div><span>{readings.length} variables</span></div>
              {readings.length === 0 ? <p className="fleet-empty">Sin mediciones registradas.</p>
                : <div className="fleet-readings">{readings.map(([type, reading]) => (
                  <article key={type} className="measurement-card">
                    <div><span className="eyebrow">{measurementNames[type] ?? type}</span>
                      <p className="measurement-value">{reading.value.toLocaleString('es-CL', {
                        maximumFractionDigits: 3,
                      })}<small>{reading.unit}</small></p>
                      <small className="fleet-reading-time">{dateLabel(reading.measuredAt)}</small></div>
                    <span className={`quality quality-${reading.quality.toLowerCase()}`}>
                      {reading.quality}</span>
                  </article>
                ))}</div>}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
