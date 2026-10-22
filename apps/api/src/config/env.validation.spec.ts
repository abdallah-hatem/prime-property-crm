import { validateEnv } from './env.validation';

const valid = {
  NODE_ENV: 'test',
  PORT: '4010',
  DATABASE_URL: 'postgresql://user:pass@localhost:5442/db',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:3010, https://crm.example.com',
};

describe('validateEnv', () => {
  it('parses a complete environment', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4010);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:3010',
      'https://crm.example.com',
    ]);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'PORT', 'CORS_ORIGINS'])(
    'fails when %s is missing',
    (key) => {
      const { [key]: _removed, ...rest } = valid as Record<string, string>;
      expect(() => validateEnv(rest)).toThrow(key);
    },
  );

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('rejects a CORS origin that is not a URL', () => {
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: 'localhost' })).toThrow(
      'CORS_ORIGINS',
    );
  });
});
