import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.validation';
import type { Tx } from '../common/interfaces/transaction.interface';

/** Pool settings for the pg driver adapter (`connection_limit` in the URL does not apply). */
export interface PoolOptions {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
}

/**
 * On Vercel every function instance opens its own pool: one connection each keeps Neon from
 * running out, and a 20 s connect timeout fails a request instead of hanging it.
 */
export function poolOptions(
  env: Pick<Env, 'DATABASE_URL' | 'VERCEL'>,
): PoolOptions {
  const base = { connectionString: env.DATABASE_URL };
  return env.VERCEL
    ? { ...base, max: 1, connectionTimeoutMillis: 20_000 }
    : base;
}

/** The one Prisma client. Repositories use it; controllers never do. */
@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg(
        poolOptions({
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          VERCEL: config.get('VERCEL', { infer: true }),
        }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `work` in one interactive transaction. Services open it and hand `tx` to every
   * repository call (and to ActivityService.record), so all of it commits or none does.
   * `options` lifts Prisma's 5 s default for bulk work (an import of 20 000 rows).
   */
  transaction<T>(
    work: (tx: Tx) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    return this.$transaction(work, options);
  }

  /** True when the database answers a trivial query. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
