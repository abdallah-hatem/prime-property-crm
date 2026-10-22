import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async check(): Promise<HealthStatus> {
    if (!(await this.database.isReachable())) {
      throw new ServiceUnavailableException({
        message: 'Database is not reachable',
        error: 'DATABASE_UNAVAILABLE',
      });
    }
    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
