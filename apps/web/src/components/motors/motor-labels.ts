export const motorStates: Record<string, string> = {
  RUNNING: 'En línea',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítico',
  OFFLINE: 'Desconectado',
  UNKNOWN: 'Sin datos',
};

export const measurementNames: Record<string, string> = {
  TEMPERATURE: 'Temperatura',
  CURRENT: 'Corriente',
  VIBRATION: 'Vibración',
  ROTATION_SPEED: 'Velocidad de rotación',
  VOLTAGE: 'Voltaje',
  FREQUENCY: 'Frecuencia',
};

export function motorTone(status: string): string {
  if (status === 'RUNNING') return 'online';
  if (status === 'WARNING') return 'warning';
  if (status === 'CRITICAL') return 'critical';
  return 'offline';
}

export function dateLabel(value: string | null): string {
  if (!value) return 'Sin registros';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(date);
}
