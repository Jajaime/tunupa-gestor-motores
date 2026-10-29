export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

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

export interface FleetMotorSummary {
  id: string;
  clientId: string;
  clientName: string;
  plantId: string;
  plantName: string;
  name: string;
  code: string;
  status: string;
  operationalStatus: string;
  lastTelemetryAt: string | null;
  activeAlarmCount: number;
  deviceCount: number;
}

export interface FleetDevice {
  id: string;
  name: string;
  code: string;
  serialNumber: string | null;
  firmwareVersion: string | null;
  communicationType: string;
  status: string;
  lastConnectionAt: string | null;
  lastTelemetryReceivedAt: string | null;
}

export interface FleetMotorDetail extends FleetMotorSummary {
  plantLocation: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  ratedPowerKw: number | null;
  ratedVoltage: number | null;
  ratedCurrent: number | null;
  ratedFrequencyHz: number | null;
  devices: FleetDevice[];
  latestMeasurements: Record<string, LatestMeasurement>;
}
