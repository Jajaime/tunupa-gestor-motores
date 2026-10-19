'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getCurrentUser, getDashboardMotors, getMotorHistory, SESSION_EXPIRED_EVENT } from '@/lib/api';
import type { DashboardMotorSummary, TelemetryHistoryPoint } from '@/lib/types';
import type { ApiConnection } from '@/lib/dashboard-status';
import { startRealtimeSession } from '@/lib/realtime-session';
import type { RealtimeStatus } from '@/lib/realtime-session';
import { createRefreshScheduler } from '@/lib/refresh-scheduler';

export function useLiveDashboard() {
  const [motors, setMotors] = useState<DashboardMotorSummary[]>([]);
  const [selectedMotorId, selectMotor] = useState('');
  const [selectedMeasurement, selectMeasurement] = useState('TEMPERATURE');
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [apiConnection, setApiConnection] = useState<ApiConnection>('connecting');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const selection = useRef({ motorId: '', measurement: 'TEMPERATURE', revision: 0 });
  const schedulerRef = useRef<ReturnType<typeof createRefreshScheduler> | null>(null);

  const refresh = useCallback(() => schedulerRef.current?.request(true), []);
  const setSelectedMotorId = useCallback((motorId: string) => {
    selection.current = { ...selection.current, motorId, revision: selection.current.revision + 1 };
    selectMotor(motorId); setHistory([]); setHistoryLoading(true); refresh();
  }, [refresh]);
  const setSelectedMeasurement = useCallback((measurement: string) => {
    selection.current = { ...selection.current, measurement, revision: selection.current.revision + 1 };
    selectMeasurement(measurement); setHistory([]); setHistoryLoading(true); refresh();
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let lastStatus: RealtimeStatus = 'connecting';
    const scheduler = createRefreshScheduler(async () => {
      try {
        const result = await getDashboardMotors();
        if (disposed) return;
        setMotors(result); setLastRefresh(new Date()); setApiConnection('connected'); setError(null);
        if (!result.some((motor) => motor.id === selection.current.motorId)) {
          const motorId = result[0]?.id ?? '';
          selection.current = { ...selection.current, motorId, revision: selection.current.revision + 1 };
          selectMotor(motorId); setHistory([]);
        }
      } catch (failure) {
        if (!disposed) {
          setApiConnection('disconnected');
          setError(failure instanceof Error ? failure.message : 'No fue posible consultar la API.');
        }
        return;
      } finally { if (!disposed) setLoading(false); }
      const view = { ...selection.current };
      if (!view.motorId) { setHistoryLoading(false); return; }
      setHistoryLoading(true);
      try {
        const points = await getMotorHistory(view.motorId, view.measurement);
        if (!disposed && view.revision === selection.current.revision) setHistory(points);
      } catch (failure) {
        if (!disposed && view.revision === selection.current.revision) {
          setError(failure instanceof Error ? failure.message : 'No fue posible cargar el histórico.');
        }
      } finally {
        if (!disposed && view.revision === selection.current.revision) setHistoryLoading(false);
      }
    });
    schedulerRef.current = scheduler;
    const origin = process.env.NEXT_PUBLIC_WS_URL ?? new URL(API_URL).origin;
    const socket = io(`${origin.replace(/\/$/, '')}/dashboard`, {
      path: '/socket.io', transports: ['websocket'], withCredentials: true,
      autoConnect: false, reconnection: false, forceNew: true, timeout: 10_000,
    });
    const stopSocket = startRealtimeSession(socket, {
      ensureSession: getCurrentUser,
      onRevoked: () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)),
      onStatus: (value) => {
        if (disposed) return;
        setRealtimeStatus(value);
        // El indicador API refleja una consulta real; perder el socket no
        // significa que HTTP o el motor estén desconectados.
        if (value !== lastStatus && value !== 'connected') scheduler.request(true);
        lastStatus = value;
      },
      onReady: () => scheduler.request(true),
      onData: () => scheduler.request(),
    });
    const visibility = () => scheduler.setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    visibility();
    const reconciliation = window.setInterval(() => scheduler.request(), 60_000);
    return () => {
      disposed = true;
      scheduler.dispose(); stopSocket();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      window.clearInterval(reconciliation);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return { motors, selectedMotorId, selectedMeasurement, setSelectedMotorId,
    setSelectedMeasurement, history, loading, historyLoading, error, lastRefresh,
    apiConnection, realtimeStatus, refresh };
}
