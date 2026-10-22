import { AnalyticsRangeQuerySchema } from '@prime-crm/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsQueryDto } from './analytics-query.dto';

/**
 * The DTO checks the shape; the service checks real dates (Feb 30) and from ≤ to, also with a
 * 400. On shape alone the DTO and the shared zod schema agree.
 */
const cases: [unknown, boolean][] = [
  [{}, true],
  [{ from: '2025-03-10' }, true],
  [{ from: '2025-03-10', to: '2025-03-12' }, true],
  [{ from: '2025-03-10T00:00:00Z' }, false],
  [{ to: '10-03-2025' }, false],
  [{ from: 'abc' }, false],
  [{ foo: '1' }, false],
];

describe('AnalyticsQueryDto mirrors AnalyticsRangeQuerySchema', () => {
  it.each(cases)('%j → %s', async (query, ok) => {
    const errors = await validate(
      plainToInstance(AnalyticsQueryDto, query as object),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.length === 0).toBe(ok);
    expect(AnalyticsRangeQuerySchema.safeParse(query).success).toBe(ok);
  });
});
