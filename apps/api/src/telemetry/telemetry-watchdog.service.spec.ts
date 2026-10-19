import type { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MotorStateService } from './motor-state.service';
import { TelemetryWatchdogService } from './telemetry-watchdog.service';

// ConfigService es un límite externo; su versión ESM se verifica en build/runtime.
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('TelemetryWatchdogService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'TELEMETRY_TIMEOUT_SECONDS' ? 30 : 5000,
    ),
  };
  const motorState = { refresh: jest.fn() };

  function create(transaction: jest.Mock) {
    return new TelemetryWatchdogService(
      { transaction } as unknown as DataSource,
      config as unknown as ConfigService,
      motorState as unknown as MotorStateService,
    );
  }

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('comparte una revisión en curso sin abrir otra transacción', async () => {
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const transaction = jest.fn().mockReturnValue(pending);
    const service = create(transaction);
    const first = service.checkNow();
    const second = service.checkNow();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    release(0);
    await expect(first).resolves.toBe(0);
    await service.onApplicationShutdown();
  });

  it('permite una nueva revisión después de un fallo de base de datos', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(new Error('Base no disponible'))
      .mockResolvedValueOnce(0);
    const service = create(transaction);
    await expect(service.checkNow()).rejects.toThrow('Base no disponible');
    await expect(service.checkNow()).resolves.toBe(0);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('revisa al iniciar y periódicamente, y detiene el timer al cerrar', async () => {
    jest.useFakeTimers();
    const transaction = jest.fn().mockResolvedValue(0);
    const service = create(transaction);
    service.onApplicationBootstrap();
    expect(transaction).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(transaction).toHaveBeenCalledTimes(3);
    await service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('el apagado espera una revisión que aún no termina', async () => {
    let release!: (value: number) => void;
    const transaction = jest.fn().mockReturnValue(
      new Promise<number>((resolve) => {
        release = resolve;
      }),
    );
    const service = create(transaction);
    void service.checkNow();
    let stopped = false;
    const shutdown = service.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release(0);
    await shutdown;
    expect(stopped).toBe(true);
  });
});
