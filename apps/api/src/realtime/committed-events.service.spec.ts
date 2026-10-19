import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import type { DashboardEvent } from './dashboard-event.types';
import { CommittedEventsService } from './committed-events.service';

describe('CommittedEventsService', () => {
  let service: CommittedEventsService;
  let runner: QueryRunner;
  let manager: EntityManager;
  const listener = jest.fn<void, [DashboardEvent[]]>();
  const start = () =>
    service.afterTransactionStart({ queryRunner: runner } as never);
  const commit = () =>
    service.afterTransactionCommit({ queryRunner: runner } as never);
  const rollback = () =>
    service.afterTransactionRollback({ queryRunner: runner } as never);
  const record = () =>
    service.record(manager, 'motor.status.changed', 'motor', null, {
      previousStatus: 'RUNNING',
      status: 'OFFLINE',
      reason: 'TELEMETRY_TIMEOUT',
    });
  beforeEach(() => {
    listener.mockReset();
    service = new CommittedEventsService({
      subscribers: [],
    } as unknown as DataSource);
    runner = { isTransactionActive: true } as QueryRunner;
    manager = { queryRunner: runner } as EntityManager;
    service.subscribe(listener);
  });
  afterEach(() => service.onModuleDestroy());
  it('publica solamente después del commit exterior', () => {
    start();
    record();
    start();
    record();
    commit();
    expect(listener).not.toHaveBeenCalled();
    runner.isTransactionActive = false;
    commit();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(2);
  });
  it('descarta la rama revertida y conserva el evento exterior', () => {
    start();
    record();
    start();
    record();
    rollback();
    runner.isTransactionActive = false;
    commit();
    expect(listener.mock.calls[0][0]).toHaveLength(1);
  });
  it('rollback exterior descarta incluso savepoints confirmados', () => {
    start();
    record();
    start();
    record();
    commit();
    runner.isTransactionActive = false;
    rollback();
    runner.isTransactionActive = true;
    start();
    runner.isTransactionActive = false;
    commit();
    expect(listener).not.toHaveBeenCalled();
  });
  it('rechaza eventos fuera de transacción', () => {
    runner.isTransactionActive = false;
    expect(record).toThrow('transacción activa');
  });
  it('desuscribir impide entregas posteriores', () => {
    const extra = jest.fn();
    const unsubscribe = service.subscribe(extra);
    unsubscribe();
    start();
    record();
    runner.isTransactionActive = false;
    commit();
    expect(extra).not.toHaveBeenCalled();
    const event = listener.mock.calls[0][0][0];
    expect(event.version).toBe(1);
    expect(event.eventId).toMatch(/^[a-f0-9-]{36}$/);
    expect(Number.isFinite(Date.parse(event.occurredAt))).toBe(true);
  });
});
