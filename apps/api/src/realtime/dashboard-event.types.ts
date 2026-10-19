export interface EventPayloads {
  'telemetry.received': {
    messageId: string;
    measuredAt: string;
    measurements: {
      type: string;
      value: number;
      unit: string;
      quality: string;
    }[];
  };
  'motor.status.changed': {
    previousStatus: string;
    status: string;
    reason: string;
  };
  'alarm.changed': {
    id: string;
    alarmType: string;
    severity: string;
    status: string;
    change: 'CREATED' | 'UPDATED' | 'RESOLVED';
    measuredValue: number | null;
    thresholdValue: number | null;
    unit: string | null;
    startedAt: string;
    resolvedAt: string | null;
  };
}
export interface DashboardEvent {
  version: 1;
  eventId: string;
  occurredAt: string;
  type: keyof EventPayloads;
  motorId: string;
  deviceId: string | null;
  data: EventPayloads[keyof EventPayloads];
}
