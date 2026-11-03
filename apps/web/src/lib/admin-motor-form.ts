import type { AdminMotorRecord, AdminMotorStatus, UpdateAdminMotor } from './api';

export interface AdminMotorForm {
  plantId: string;
  name: string;
  code: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  ratedPowerKw: string;
  ratedVoltage: string;
  ratedCurrent: string;
  ratedFrequencyHz: string;
  status: AdminMotorStatus;
}

export const emptyAdminMotorForm: AdminMotorForm = {
  plantId: '', name: '', code: '', manufacturer: '', model: '', serialNumber: '',
  ratedPowerKw: '', ratedVoltage: '', ratedCurrent: '', ratedFrequencyHz: '',
  status: 'ACTIVE',
};

function numberOrNull(value: string, label: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || !/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    throw new Error(`${label}: ingresa un valor positivo con hasta 3 decimales (separador punto).`);
  }
  return parsed;
}

export function buildAdminMotorPayload(form: AdminMotorForm): UpdateAdminMotor {
  const name = form.name.trim();
  const code = form.code.trim();
  if (!name || !code) throw new Error('Nombre y código del motor son obligatorios.');
  return {
    name,
    code,
    status: form.status,
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    serialNumber: form.serialNumber.trim() || null,
    ratedPowerKw: numberOrNull(form.ratedPowerKw, 'Potencia nominal'),
    ratedVoltage: numberOrNull(form.ratedVoltage, 'Voltaje nominal'),
    ratedCurrent: numberOrNull(form.ratedCurrent, 'Corriente nominal'),
    ratedFrequencyHz: numberOrNull(form.ratedFrequencyHz, 'Frecuencia nominal'),
  };
}

export function adminMotorFormFromRecord(record: AdminMotorRecord): AdminMotorForm {
  return {
    plantId: record.plantId,
    name: record.name,
    code: record.code,
    manufacturer: record.manufacturer ?? '',
    model: record.model ?? '',
    serialNumber: record.serialNumber ?? '',
    ratedPowerKw: record.ratedPowerKw?.toString() ?? '',
    ratedVoltage: record.ratedVoltage?.toString() ?? '',
    ratedCurrent: record.ratedCurrent?.toString() ?? '',
    ratedFrequencyHz: record.ratedFrequencyHz?.toString() ?? '',
    status: record.status,
  };
}
