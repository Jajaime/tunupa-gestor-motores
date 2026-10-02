export interface LatestMeasurement {
  value: number;
  unit: string;
  quality: string;
  measuredAt: string;
}

export interface DashboardMotorSummary {
  id: string;
  plantId: string;
  plantName: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  lastTelemetryAt: string | null;
  device: {
    id: string;
    code: string;
    status: string;
    lastConnectionAt: string | null;
  } | null;
  activeAlarmCount: number;
  latestMeasurements: Record<string, LatestMeasurement>;
}

export interface TelemetryHistoryPoint {
  measurementType: string;
  value: number;
  unit: string;
  quality: string;
  measuredAt: string;
}
