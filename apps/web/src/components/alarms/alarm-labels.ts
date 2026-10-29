export const alarmStatus: Record<string, string> = {
  ACTIVE: 'Activa',
  ACKNOWLEDGED: 'Reconocida',
  RESOLVED: 'Resuelta',
};
export const alarmSeverity: Record<string, string> = {
  INFO: 'Informativa',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítica',
};
export const alarmEvent: Record<string, string> = {
  CREATED: 'Alarma generada',
  UPDATED: 'Estado o severidad actualizados',
  ACKNOWLEDGED: 'Reconocida por un operador',
  RESOLVED: 'Resuelta por la telemetría',
};
export function alarmDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'medium' }).format(parsed);
}
