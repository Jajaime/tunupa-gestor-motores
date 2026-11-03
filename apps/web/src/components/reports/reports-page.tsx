'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/components/auth/auth-provider';
import { getFleetMotors, getMotorTrends } from '@/lib/api';
import type { FleetMotorSummary } from '@/lib/types';
import { measurementNames } from '@/components/motors/motor-labels';
import { resolveTrendWindow, type TrendPeriod, type TrendWindow } from '@/lib/trends-model';
import { buildReportCsv, reportFilename, summarizeReport, type MotorReport } from '@/lib/reports-model';

const variables = ['TEMPERATURE', 'CURRENT', 'VIBRATION', 'ROTATION_SPEED', 'VOLTAGE', 'FREQUENCY'] as const;
const displayNumber = (n: number | null) => n === null ? '—'
  : n.toLocaleString('es-CL', { maximumFractionDigits: 3 });
const displayDate = (s: string) => new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short', timeStyle: 'medium',
}).format(new Date(s));

export function ReportsPage() {
  const { user, signOut } = useAuth();
  const [motors, setMotors] = useState<FleetMotorSummary[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('ALL');
  const [plantId, setPlantId] = useState('ALL');
  const [motorId, setMotorId] = useState('');
  const [variable, setVariable] = useState<string>('TEMPERATURE');
  const [period, setPeriod] = useState<TrendPeriod>('24h');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [report, setReport] = useState<MotorReport | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    let alive = true;
    void getFleetMotors().then(items => {
      if (alive) { setMotors(items); setError(''); }
    }).catch((failure: unknown) => {
      if (alive) setError(failure instanceof Error ? failure.message : 'No se pudo consultar el inventario.');
    }).finally(() => { if (alive) setLoadingInventory(false); });
    return () => { alive = false; requestId.current += 1; };
  }, []);

  const clients = useMemo(() => Array.from(new Map(motors.map(m =>
    [m.clientId, { id: m.clientId, name: m.clientName }])).values())
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [motors]);
  const plants = useMemo(() => Array.from(new Map(motors.filter(m =>
    clientId === 'ALL' || m.clientId === clientId).map(m =>
    [m.plantId, { id: m.plantId, name: m.plantName }])).values())
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [clientId, motors]);
  const visible = useMemo(() => motors.filter(m =>
    (clientId === 'ALL' || m.clientId === clientId) &&
    (plantId === 'ALL' || m.plantId === plantId)), [clientId, plantId, motors]);

  function invalidate() {
    requestId.current += 1;
    setReport(null);
    setBusy(false);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    invalidate();
    const motor = visible.find(m => m.id === motorId);
    if (!motor) { setError('Selecciona un motor válido para generar el informe.'); return; }
    let window: TrendWindow;
    try { window = resolveTrendWindow(period, fromDay, toDay); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Período inválido.'); return; }
    const current = ++requestId.current;
    setBusy(true);
    try {
      const points = await getMotorTrends(motor.id, { measurementType: variable, ...window });
      if (current !== requestId.current) return;
      summarizeReport(points); // Validar unidades y valores antes de publicar el informe.
      setReport({
        clientName: motor.clientName, plantName: motor.plantName,
        motorName: motor.name, motorCode: motor.code,
        measurementName: measurementNames[variable] ?? variable,
        points, window, generatedAt: new Date().toISOString(),
      });
    } catch (failure) {
      if (current === requestId.current) setError(failure instanceof Error ? failure.message : 'No se pudo generar el informe.');
    } finally { if (current === requestId.current) setBusy(false); }
  }

  function downloadCsv() {
    if (!report || report.points.length === 0) return;
    const blob = new Blob([buildReportCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFilename(report);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const summary = report ? summarizeReport(report.points) : null;

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content tunupa-reports">
        <header className="topbar reports-ui-only">
          <div>
            <span className="eyebrow">TUNUPA DATA · REPORTERÍA</span>
            <h1>Informes</h1>
            <p>Descarga reportes de telemetría agregada de tus motores autorizados.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <button className="refresh-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
          </div>
        </header>

        <section className="panel reports-filters-panel reports-ui-only" aria-label="Filtros del informe">
          <div className="panel-heading"><h2>Generar informe</h2><span>Hasta 31 días</span></div>
          <form className="reports-filters" onSubmit={(event) => void submit(event)}>
            <label>Empresa
              <select value={clientId} disabled={loadingInventory} onChange={e => {
                invalidate(); setClientId(e.target.value); setPlantId('ALL'); setMotorId('');
              }}>
                <option value="ALL">Todas las empresas autorizadas</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Planta
              <select value={plantId} disabled={loadingInventory} onChange={e => {
                invalidate(); setPlantId(e.target.value); setMotorId('');
              }}>
                <option value="ALL">Todas las plantas</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Motor
              <select value={motorId} required disabled={loadingInventory} onChange={e => {
                invalidate(); setMotorId(e.target.value);
              }}>
                <option value="">Selecciona un motor</option>
                {visible.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </select>
            </label>
            <label>Variable
              <select value={variable} onChange={e => { invalidate(); setVariable(e.target.value); }}>
                {variables.map(v => <option key={v} value={v}>{measurementNames[v] ?? v}</option>)}
              </select>
            </label>
            <label>Período
              <select value={period} onChange={e => { invalidate(); setPeriod(e.target.value as TrendPeriod); }}>
                <option value="24h">Últimas 24 horas</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </label>
            {period === 'custom' && <>
              <label>Desde (fecha local)
                <input type="date" required value={fromDay} onChange={e => { invalidate(); setFromDay(e.target.value); }} />
              </label>
              <label>Hasta (fecha local, inclusive)
                <input type="date" required value={toDay} onChange={e => { invalidate(); setToDay(e.target.value); }} />
              </label>
            </>}
            <div className="reports-submit">
              <button className="auth-submit" type="submit" disabled={loadingInventory || busy || !motorId}>
                {busy ? 'Generando…' : 'Consultar informe'}
              </button>
              <span>Promedio, mínimo, máximo y muestras válidas por intervalo. No son lecturas individuales.</span>
            </div>
          </form>
        </section>

        {error && <div className="error-banner reports-ui-only" role="alert">{error}</div>}
        {loadingInventory && <p className="reports-empty reports-ui-only" role="status">Cargando motores autorizados…</p>}
        {!loadingInventory && motors.length === 0 && <p className="reports-empty reports-ui-only" role="status">No hay motores autorizados.</p>}
        {busy && <p className="reports-empty reports-ui-only" role="status">Consultando mediciones…</p>}

        {report && summary && <section className="reports-document" aria-label="Informe de telemetría">
          <div className="reports-document-head">
            <div>
              <span className="eyebrow">INFORME TÉCNICO · TUNUPA DATA</span>
              <h2>Mediciones históricas de motor</h2>
            </div>
            <p>Generado: {displayDate(report.generatedAt)}</p>
          </div>
          <dl className="reports-metadata">
            <div><dt>Empresa</dt><dd>{report.clientName}</dd></div>
            <div><dt>Planta</dt><dd>{report.plantName}</dd></div>
            <div><dt>Motor</dt><dd>{report.motorCode} · {report.motorName}</dd></div>
            <div><dt>Variable</dt><dd>{report.measurementName}</dd></div>
            <div><dt>Período (hora local)</dt><dd>{displayDate(report.window.from)} – {displayDate(report.window.to)}</dd></div>
            <div><dt>Agrupación</dt><dd>{report.window.bucket}</dd></div>
          </dl>
          <div className="reports-summary" aria-label="Indicadores del informe">
            <article><span>Promedio ponderado</span><strong>{displayNumber(summary.average)} <small>{summary.unit}</small></strong></article>
            <article><span>Mínimo</span><strong>{displayNumber(summary.minimum)} <small>{summary.unit}</small></strong></article>
            <article><span>Máximo</span><strong>{displayNumber(summary.maximum)} <small>{summary.unit}</small></strong></article>
            <article><span>Muestras válidas</span><strong>{summary.sampleCount.toLocaleString('es-CL')}</strong></article>
          </div>
          <div className="reports-export-actions reports-ui-only">
            <button type="button" className="auth-submit" disabled={report.points.length === 0} onClick={downloadCsv}>
              Descargar CSV
            </button>
            <button type="button" className="refresh-button" onClick={() => window.print()}>
              Imprimir / Guardar como PDF
            </button>
            <Link href="/trends">Ver tendencias</Link>
          </div>
          {report.points.length === 0 ? <p className="reports-empty" role="status">Sin mediciones para el motor, variable y período seleccionados.</p> : (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <caption>Intervalos con mediciones: {report.points.length}</caption>
                <thead><tr><th>Fecha/hora local</th><th>Promedio</th><th>Mínimo</th><th>Máximo</th><th>Muestras</th><th>Unidad</th></tr></thead>
                <tbody>{report.points.map((p, i) => <tr key={`${p.bucketAt}-${p.unit}-${i}`}>
                  <td>{displayDate(p.bucketAt)}</td><td>{displayNumber(p.average)}</td>
                  <td>{displayNumber(p.minimum)}</td><td>{displayNumber(p.maximum)}</td>
                  <td>{p.sampleCount.toLocaleString('es-CL')}</td><td>{p.unit}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="reports-footnote">Histórico agregado de TUNUPA. Se incluyen muestras GOOD y UNCERTAIN; se excluyen BAD.
            Los intervalos sin muestras no generan filas. El CSV utiliza horarios UTC; aquí se muestran en la hora local del navegador.</p>
          <p className="reports-print-footer">TUNUPA DATA · GroundTEK Power Systems</p>
        </section>}
      </section>
    </main>
  );
}
