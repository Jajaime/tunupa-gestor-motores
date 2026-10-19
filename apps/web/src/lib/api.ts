import type { AuthUser, DashboardMotorSummary, TelemetryHistoryPoint } from './types';

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/$/, '');

export const SESSION_EXPIRED_EVENT = 'tunupa:session-expired';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;
let refreshPromise: Promise<void> | null = null;
let refreshRevision = 0;
let sessionVersion = 0;
let loggingOut = false;

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init, credentials: 'include', cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(0, 'No fue posible contactar el servidor. Intenta nuevamente.');
  }
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'La sesión expiró. Inicia sesión nuevamente.',
      403: 'La solicitud no fue autorizada. Intenta nuevamente.',
      429: 'Demasiados intentos. Espera un minuto antes de volver a intentar.',
    };
    throw new ApiError(response.status, messages[response.status] ?? 'No fue posible completar la solicitud.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    const operation = (async () => {
      const result = await read<{ csrfToken: string }>(await send('/auth/csrf'));
      if (!result.csrfToken) throw new ApiError(0, 'No fue posible preparar el inicio de sesión.');
      csrfToken = result.csrfToken;
      return result.csrfToken;
    })();
    csrfPromise = operation;
    void operation.finally(() => {
      if (csrfPromise === operation) csrfPromise = null;
    }).catch(() => undefined);
  }
  return csrfPromise;
}

async function postAuth(path: string, payload?: unknown): Promise<Response> {
  const post = async () => send(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': await getCsrf(),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  let response = await post();
  // Otra pestaña puede haber reemplazado la cookie CSRF.
  if (response.status === 403) {
    csrfToken = null;
    response = await post();
  }
  return response;
}

function expired(): ApiError {
  return new ApiError(401, 'La sesión expiró. Inicia sesión nuevamente.');
}

function assertSession(version: number): void {
  if (version !== sessionVersion || loggingOut) throw expired();
}

async function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    const version = sessionVersion;
    const operation = (async () => {
      const rotate = async () => {
        assertSession(version);
        // Las pestañas comparten cookies. Dentro del lock comprobamos si otra
        // pestaña ya renovó antes de consumir el refresh token de un solo uso.
        if (typeof navigator !== 'undefined' && navigator.locks) {
          const current = await send('/auth/me');
          if (current.ok) return;
          if (current.status !== 401) { await read(current); return; }
        }
        await read(await postAuth('/auth/refresh'));
      };
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request('tunupa:session-refresh', rotate);
      } else {
        await rotate();
      }
      assertSession(version);
      refreshRevision += 1;
    })();
    refreshPromise = operation;
    void operation.finally(() => {
      if (refreshPromise === operation) refreshPromise = null;
    }).catch(() => undefined);
  }
  return refreshPromise;
}

async function request<T>(path: string): Promise<T> {
  const version = sessionVersion;
  const revision = refreshRevision;
  try {
    assertSession(version);
    let response = await send(path);
    assertSession(version);
    if (response.status === 401) {
      // Un 401 tardío puede pertenecer a una petición anterior al último refresh.
      if (revision === refreshRevision) await refreshSession();
      assertSession(version);
      response = await send(path);
      assertSession(version);
    }
    return await read<T>(response);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401
      && version === sessionVersion && !loggingOut && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  sessionVersion += 1;
  if (refreshPromise) await refreshPromise.catch(() => undefined);
  const response = await postAuth('/auth/login', { email: email.trim().toLowerCase(), password });
  if (response.status === 401) throw new ApiError(401, 'Correo o contraseña incorrectos, o cuenta no disponible.');
  const result = await read<{ user: AuthUser }>(response);
  refreshRevision += 1;
  return result.user;
}

export async function logout(): Promise<void> {
  loggingOut = true;
  sessionVersion += 1;
  try {
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    let response = await postAuth('/auth/logout');
    // Logout está protegido: renovar primero si el access token ya expiró.
    if (response.status === 401) {
      const refresh = await postAuth('/auth/refresh');
      if (refresh.status === 401) return;
      await read(refresh);
      response = await postAuth('/auth/logout');
    }
    await read<void>(response);
  } finally {
    loggingOut = false;
    sessionVersion += 1;
    csrfToken = null;
  }
}

export async function getCurrentUser(): Promise<AuthUser> {
  return (await request<{ user: AuthUser }>('/auth/me')).user;
}

export function getDashboardMotors(): Promise<DashboardMotorSummary[]> {
  return request<DashboardMotorSummary[]>('/dashboard/motors');
}

export function getMotorHistory(
  motorId: string, measurementType: string, limit = 120,
): Promise<TelemetryHistoryPoint[]> {
  const query = new URLSearchParams({ measurementType, limit: String(limit) });
  return request<TelemetryHistoryPoint[]>(
    `/dashboard/motors/${encodeURIComponent(motorId)}/history?${query}`,
  );
}
