import { poolOptions } from './database.service';

const DATABASE_URL = 'postgresql://user:pass@localhost:5442/db';

describe('poolOptions', () => {
  it('uses the driver defaults outside Vercel', () => {
    expect(poolOptions({ DATABASE_URL, VERCEL: undefined })).toEqual({
      connectionString: DATABASE_URL,
    });
  });

  it('keeps one connection and a 20 s connect timeout on Vercel', () => {
    expect(poolOptions({ DATABASE_URL, VERCEL: '1' })).toEqual({
      connectionString: DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 20_000,
    });
  });
});
