'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/components/auth/auth-provider';
import { getFleetMotors, getMotorTrends } from '@/lib/api';
import type { FleetMotorSummary } from '@/lib/types';
import {
  alignTrendSeries, resolveTrendWindow, type TrendPeriod,
  type TrendSeries, type TrendWindow, type ChartRow,
} from '@/lib/trends-model';
import { measurementNames } from '@/components/motors/motor-labels';
import { TrendsChart } from './trends-chart';

const variables = ['TEMPERATURE', 'CURRENT', 'VIBRATION', 'ROTATION_SPEED', 'VOLTAGE', 'FREQUENCY'] as const;

type TrendResult = { series: TrendSeries[]; rows: ChartRow[]; unit: string; window: TrendWindow };

export function TrendsPage() {
  const { user, signOut } = useAuth();
  const [motors, setMotors] = useState<FleetMotorSummary[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('ALL');
  const [plantId, setPlantId] = useState('ALL');
  const [motorId, setMotorId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [variable, setVariable] = useState<string>('TEMPERATURE');
  const [period, setPeriod] = useState<TrendPeriod>('24h');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [result, setResult] = useState<TrendResult | null>(null);
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

  const clients = useMemo(() => Array.from(
    new Map(motors.map(motor => [motor.clientId, { id: motor.clientId, name: motor.clientName }])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, 'es')), [motors]);
  const plants = useMemo(() => Array.from(
    new Map(motors.filter(m => clientId === 'ALL' || m.clientId === clientId)
      .map(motor => [motor.plantId, { id: motor.plantId, name: motor.plantName }])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, 'es')), [clientId, motors]);
  const visible = useMemo(() => motors.filter(m =>
    (clientId === 'ALL' || m.clientId === clientId) &&
    (plantId === 'ALL' || m.plantId === plantId),
  ), [clientId, plantId, motors]);

  function invalidate() {
    requestId.current += 1;
    setResult(null);
    setBusy(false);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    invalidate();
    if (!motorId || !visible.some(m => m.id === motorId)) {
      setError('Selecciona un motor válido para consultar.'); return;
    }
    if (compareId && (compareId === motorId || !visible.some(m => m.id === compareId))) {
      setError('Selecciona otro motor válido para comparar.'); return;
    }
    let window: TrendWindow;
    try { window = resolveTrendWindow(period, fromDay, toDay); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Período inválido.'); return; }
    const current = ++requestId.current;
    setBusy(true);
    try {
      const ids = [motorId, ...(compareId ? [compareId] : [])];
      const responses = await Promise.all(ids.map(id => getMotorTrends(id, { measurementType: variable, ...window })));
      if (current !== requestId.current) return;
      const series = ids.map((id, i) => ({
        id, label: visible.find(m => m.id === id)?.code ?? id, points: responses[i],
      }));
      const aligned = alignTrendSeries(series, window.bucket);
      setResult({ series, rows: aligned.rows, unit: aligned.unit, window });
    } catch (failure) {
      if (current === requestId.current) setError(failure instanceof Error ? failure.message : 'No se pudo consultar tendencias.');
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  }

  const principal = result?.series[0].points ?? [];
  const sampleCount = principal.reduce((sum, p) => sum + p.sampleCount, 0);
  const mean = sampleCount ? principal.reduce((sum, p) => sum + p.average * p.sampleCount, 0) / sampleCount : null;
  const min = principal.length ? Math.min(...principal.map(p => p.minimum)) : null;
  const max = principal.length ? Math.max(...principal.map(p => p.maximum)) : null;
  const fmt = (n: number | null) => n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content tunupa-trends">
        <header className="topbar">
          <div>
            <span className="eyebrow">TUNUPA DATA · ANÁLISIS OPERATIVO</span>
            <h1>Tendencias</h1>
            <p>Históricos agregados de tus motores. Compara promedios sin perder el detalle de mínimos y máximos.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <button className="refresh-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
          </div>
        </header>

        <section className="panel trends-filters-panel" aria-label="Filtros de tendencias">
          <div className="panel-heading"><h2>Consultar mediciones</h2><span>Hasta dos motores</span></div>
          <form className="trends-filters" onSubmit={(event) => void submit(event)}>
            <label>Empresa
              <select value={clientId} disabled={loadingInventory} onChange={e => {
                invalidate(); setClientId(e.target.value); setPlantId('ALL'); setMotorId(''); setCompareId('');
              }}>
                <option value="ALL">Todas las empresas autorizadas</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Planta
              <select value={plantId} disabled={loadingInventory} onChange={e => {
                invalidate(); setPlantId(e.target.value); setMotorId(''); setCompareId('');
              }}>
                <option value="ALL">Todas las plantas</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Motor principal
              <select value={motorId} required disabled={loadingInventory} onChange={e => {
                invalidate(); setMotorId(e.target.value); if (e.target.value === compareId) setCompareId('');
              }}>
                <option value="">Selecciona un motor</option>
                {visible.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </select>
            </label>
            <label>Comparar con (opcional)
              <select value={compareId} disabled={loadingInventory || !motorId} onChange={e => {
                invalidate(); setCompareId(e.target.value);
              }}>
                <option value="">Sin comparación</option>
                {visible.filter(m => m.id !== motorId).map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
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
            <div className="trends-actions">
              <button className="auth-submit" type="submit" disabled={loadingInventory || busy || !motorId}>
                {busy ? 'Consultando…' : 'Consultar tendencias'}
              </button>
              <span>Máximo 31 días. Datos agrupados por intervalos, no lecturas individuales.</span>
            </div>
          </form>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {loadingInventory && <p role="status" className="trends-empty">Cargando motores autorizados…</p>}
        {!loadingInventory && motors.length === 0 && <p className="trends-empty" role="status">No hay motores autorizados para consultar.</p>}
        {busy && <p className="trends-empty" role="status">Calculando las tendencias…</p>}
        {result && <>
          <section className="trends-summary" aria-label="Resumen del motor principal">
            <article><span>Promedio ponderado</span><strong>{fmt(mean)} <small>{result.unit}</small></strong></article>
            <article><span>Mínimo registrado</span><strong>{fmt(min)} <small>{result.unit}</small></strong></article>
            <article><span>Máximo registrado</span><strong>{fmt(max)} <small>{result.unit}</small></strong></article>
            <article><span>Muestras válidas</span><strong>{sampleCount.toLocaleString('es-CL')}</strong></article>
          </section>
          <section className="panel trends-result-panel" aria-label="Tendencia histórica">
            <div className="panel-heading">
              <div><span className="eyebrow">HISTÓRICO</span><h2>{measurementNames[variable] ?? variable}</h2></div>
              <span>Agrupación {result.window.bucket}</span>
            </div>
            <TrendsChart rows={result.rows} series={result.series} unit={result.unit} />
            <p className="trends-note">Promedios por intervalo · mínimo y máximo corresponden a lecturas individuales.
              Se excluyen muestras de calidad BAD; se incluyen GOOD y UNCERTAIN. Los vacíos indican períodos sin mediciones. Los horarios se muestran según tu zona local.</p>
          </section>
          {result.series[0] && <p className="trends-detail-link">
            <Link href={`/motors/${result.series[0].id}`}>Ver ficha del motor principal</Link>
          </p>}
        </>}
      </section>
    </main>
  );
}
