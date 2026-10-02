import type {
  DashboardMotorSummary,
  TelemetryHistoryPoint,
} from '@/lib/types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`La API respondió con estado ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function getDashboardMotors(): Promise<DashboardMotorSummary[]> {
  return request<DashboardMotorSummary[]>('/dashboard/motors');
}

export function getMotorHistory(
  motorId: string,
  measurementType: string,
  limit = 120,
): Promise<TelemetryHistoryPoint[]> {
  const query = new URLSearchParams({
    measurementType,
    limit: String(limit),
  });

  return request<TelemetryHistoryPoint[]>(
    `/dashboard/motors/${encodeURIComponent(motorId)}/history?${query}`,
  );
}
