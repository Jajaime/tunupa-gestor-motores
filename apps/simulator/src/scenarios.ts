export const scenarios = [
  'normal', 'overtemperature', 'overcurrent', 'high-vibration',
  'connection-loss', 'telemetry-silence',
] as const;

export type Scenario = (typeof scenarios)[number];
export interface Measurement {
  type: string;
  value: number;
  unit: string;
  quality: 'GOOD';
}

export function createMeasurements(
  scenario: Scenario,
  ratedCurrent: number,
  random: () => number = Math.random,
): Measurement[] {
  if (!Number.isFinite(ratedCurrent) || ratedCurrent <= 0) {
    throw new Error('La corriente nominal debe ser un número positivo en amperios.');
  }
  const between = (min: number, max: number) => min + random() * (max - min);
  const measurement = (type: string, value: number, unit: string, decimals = 2): Measurement => ({
    type, value: Number(value.toFixed(decimals)), unit, quality: 'GOOD',
  });
  let temperature = between(48, 65);
  let current = between(ratedCurrent * 0.8, ratedCurrent * 1.1);
  let vibration = between(1.2, 2.8);
  if (scenario === 'overtemperature') temperature = between(100, 110);
  if (scenario === 'overcurrent') {
    current = between(ratedCurrent * 2.1, ratedCurrent * 2.4);
    temperature = between(65, 75);
  }
  if (scenario === 'high-vibration') vibration = between(8, 15);
  return [
    measurement('ROTATION_SPEED', between(1430, 1490), 'rpm'),
    measurement('TEMPERATURE', temperature, 'C'),
    measurement('CURRENT', current, 'A', 6),
    measurement('VOLTAGE', between(215, 225), 'V'),
    measurement('FREQUENCY', between(49.8, 50.2), 'Hz'),
    measurement('VIBRATION', vibration, 'mm/s'),
  ];
}
