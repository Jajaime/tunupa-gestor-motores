import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface DatabaseStatusRow {
  database: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check() {
    try {
      const [databaseStatus] = await this.dataSource.query<DatabaseStatusRow[]>(
        'SELECT current_database()::text AS database',
      );

      if (!databaseStatus) {
        throw new Error('PostgreSQL no devolvió información');
      }

      return {
        status: 'ok',
        database: {
          status: 'up',
          name: databaseStatus.database,
        },
        checkedAt: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: {
          status: 'down',
        },
        checkedAt: new Date().toISOString(),
      });
    }
  }
}
