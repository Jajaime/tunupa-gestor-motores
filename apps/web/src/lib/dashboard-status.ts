import type { DashboardMotorSummary } from './types';

export type ApiConnection = 'connecting' | 'connected' | 'disconnected';

export function connectionLabel(connection: ApiConnection): string {
  return {
    connecting: 'Conectando con API',
    connected: 'API conectada',
    disconnected: 'API no disponible',
  }[connection];
}

export function summarizeMotorStates(
  motors: readonly Pick<DashboardMotorSummary, 'operationalStatus' | 'activeAlarmCount'>[],
) {
  return motors.reduce((summary, motor) => ({
    online: summary.online + (['RUNNING', 'ONLINE', 'WARNING', 'CRITICAL'].includes(motor.operationalStatus) ? 1 : 0),
    offline: summary.offline + (motor.operationalStatus === 'OFFLINE' ? 1 : 0),
    unknown: summary.unknown + (motor.operationalStatus === 'UNKNOWN' ? 1 : 0),
    alarms: summary.alarms + motor.activeAlarmCount,
  }), { online: 0, offline: 0, unknown: 0, alarms: 0 });
}
