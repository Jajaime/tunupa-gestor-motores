import type { Socket } from 'socket.io-client';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export const realtimeLabels: Record<RealtimeStatus, string> = {
  connecting: 'Tiempo real: conectando',
  connected: 'Tiempo real: conectado',
  reconnecting: 'Tiempo real: reconectando',
  disconnected: 'Tiempo real: desconectado',
};

export interface DashboardEvent {
  version: 1; eventId: string; occurredAt: string; motorId: string;
  deviceId: string | null; type: 'telemetry.received' | 'motor.status.changed' | 'alarm.changed';
  data: Record<string, unknown>;
}
const dataEvents = ['telemetry.received', 'motor.status.changed', 'alarm.changed'] as const;
interface Dependencies {
  onReady?: () => void;
  onData?: (event: DashboardEvent) => void;
  ensureSession: () => Promise<unknown>;
  onRevoked: () => void;
  onStatus: (status: RealtimeStatus) => void;
}

// Un único controlador posee el socket y sus reintentos; dispose impide que
// una renovación pendiente vuelva a conectarlo después del logout/unmount.
export function startRealtimeSession(socket: Socket, deps: Dependencies): () => void {
  let stopped = false;
  let recovering = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  const status = (value: RealtimeStatus) => { if (!stopped) deps.onStatus(value); };
  const cancelTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const retry = () => {
    if (stopped || recovering || timer) return;
    status('reconnecting');
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped) socket.connect();
    }, delay);
    delay = Math.min(delay * 2, 30_000);
  };
  const revoked = () => {
    if (stopped) return;
    status('disconnected');
    stopped = true;
    cancelTimer();
    socket.disconnect();
    deps.onRevoked();
  };
  const recover = async () => {
    if (stopped || recovering) return;
    recovering = true;
    cancelTimer();
    socket.disconnect();
    status('reconnecting');
    try {
      // Usa el cliente HTTP existente y su renovación compartida; si otra
      // consulta ya renovó, /auth/me responde y no se rota de nuevo.
      await deps.ensureSession();
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        revoked();
      }
    } finally {
      recovering = false;
      retry();
    }
  };
  const onReady = () => {
    if (stopped) return;
    cancelTimer(); delay = 1000; status('connected'); deps.onReady?.();
  };
  const onExpired = () => { void recover(); };
  const onUnavailable = () => { socket.disconnect(); retry(); };
  const onDisconnect = () => retry();
  const onError = (error: Error & { data?: { code?: string } }) => {
    const code = error.data?.code;
    if (code === 'SESSION_REVOKED') { revoked(); return; }
    if (code === 'AUTH_REQUIRED' || code === 'ACCESS_EXPIRED') { void recover(); return; }
    if (code === 'ORIGIN_FORBIDDEN') {
      status('disconnected'); stopped = true; cancelTimer(); socket.disconnect(); return;
    }
    retry();
  };
  const seen = new Set<string>();
  const dataListeners = dataEvents.map((name) => {
    const listener = (value: unknown) => {
      if (stopped || !socket.connected || !value || typeof value !== 'object') return;
      const candidate = value as Partial<DashboardEvent>;
      if (candidate.version !== 1 || candidate.type !== name || typeof candidate.eventId !== 'string'
        || typeof candidate.motorId !== 'string' || !candidate.data || typeof candidate.data !== 'object') return;
      if (seen.has(candidate.eventId)) return;
      seen.add(candidate.eventId);
      if (seen.size > 512) seen.delete(seen.values().next().value!);
      deps.onData?.(candidate as DashboardEvent);
    };
    socket.on(name, listener);
    return { name, listener };
  });
  socket.on('session.ready', onReady);
  socket.on('session.expired', onExpired);
  socket.on('session.revoked', revoked);
  socket.on('session.unavailable', onUnavailable);
  socket.on('disconnect', onDisconnect);
  socket.on('connect_error', onError);
  socket.connect();
  return () => {
    stopped = true;
    cancelTimer();
    for (const { name, listener } of dataListeners) socket.off(name, listener);
    seen.clear();
    socket.off('session.ready', onReady);
    socket.off('session.expired', onExpired);
    socket.off('session.revoked', revoked);
    socket.off('session.unavailable', onUnavailable);
    socket.off('disconnect', onDisconnect);
    socket.off('connect_error', onError);
    socket.disconnect();
  };
}
