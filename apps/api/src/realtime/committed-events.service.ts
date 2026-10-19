import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type {
  EntityManager,
  EntitySubscriberInterface,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  TransactionStartEvent,
} from 'typeorm';
import type { DashboardEvent, EventPayloads } from './dashboard-event.types';

// Cola de eventos por transacción/savepoint. Nunca publica al confirmar solo un
// savepoint; el rollback descarta su rama. No es un outbox durable.
@Injectable()
export class CommittedEventsService
  implements EntitySubscriberInterface, OnModuleDestroy
{
  private readonly logger = new Logger(CommittedEventsService.name);
  private readonly pending = new WeakMap<QueryRunner, DashboardEvent[][]>();
  private readonly listeners = new Set<(events: DashboardEvent[]) => void>();
  constructor(private readonly db: DataSource) {
    db.subscribers.push(this);
  }

  private frames(runner: QueryRunner): DashboardEvent[][] {
    let frames = this.pending.get(runner);
    if (!frames) {
      frames = [];
      this.pending.set(runner, frames);
    }
    return frames;
  }
  afterTransactionStart({ queryRunner }: TransactionStartEvent): void {
    this.frames(queryRunner).push([]);
  }

  record<K extends keyof EventPayloads>(
    manager: EntityManager,
    type: K,
    motorId: string,
    deviceId: string | null,
    data: EventPayloads[K],
  ): void {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive) {
      throw new Error('Los eventos requieren una transacción activa.');
    }
    const frames = this.frames(runner);
    if (frames.length === 0) frames.push([]);
    frames[frames.length - 1].push({
      version: 1,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      type,
      motorId,
      deviceId,
      data,
    });
  }

  afterTransactionCommit({ queryRunner }: TransactionCommitEvent): void {
    const frames = this.pending.get(queryRunner);
    if (!frames) return;
    const events = frames.pop() ?? [];
    if (queryRunner.isTransactionActive) {
      if (frames.length === 0) frames.push([]);
      frames[frames.length - 1].push(...events);
      return;
    }
    this.pending.delete(queryRunner);
    if (events.length === 0) return;
    const occurredAt = new Date().toISOString();
    for (const event of events) event.occurredAt = occurredAt;
    // Los fallos de entrega no pueden convertir un COMMIT exitoso en un error
    // de ingesta. La reconciliación HTTP recupera el estado persistido.
    for (const listener of this.listeners) {
      try {
        listener(events);
      } catch {
        this.logger.error(
          'No fue posible entregar un lote de eventos confirmados.',
        );
      }
    }
  }
  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent): void {
    const frames = this.pending.get(queryRunner);
    frames?.pop();
    if (!queryRunner.isTransactionActive) this.pending.delete(queryRunner);
  }
  subscribe(listener: (events: DashboardEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  onModuleDestroy(): void {
    const index = this.db.subscribers.indexOf(this);
    if (index >= 0) this.db.subscribers.splice(index, 1);
    this.listeners.clear();
  }
}
