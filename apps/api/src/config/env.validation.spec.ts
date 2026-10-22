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

  it.each(['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGINS'])(
    'fails when %s is missing',
    (key) => {
      const { [key]: _removed, ...rest } = valid as Record<string, string>;
      expect(() => validateEnv(rest)).toThrow(key);
    },
  );

  it('defaults PORT to 3000 when unset', () => {
    const { PORT: _port, ...rest } = valid;
    expect(validateEnv(rest).PORT).toBe(3000);
  });

  it('rejects a PORT that is not a port number', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow('PORT');
  });

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

  describe('CRON_SECRET', () => {
    it('is optional outside production (unset or empty)', () => {
      expect(validateEnv(valid).CRON_SECRET).toBeUndefined();
      expect(validateEnv({ ...valid, CRON_SECRET: '' }).CRON_SECRET).toBe(
        undefined,
      );
    });

    it('is required when NODE_ENV=production', () => {
      expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
        'CRON_SECRET',
      );
      expect(() =>
        validateEnv({ ...valid, NODE_ENV: 'production', CRON_SECRET: '' }),
      ).toThrow('CRON_SECRET');
    });

    it('is accepted in production when set', () => {
      const env = validateEnv({
        ...valid,
        NODE_ENV: 'production',
        CRON_SECRET: 'c'.repeat(32),
      });
      expect(env.CRON_SECRET).toBe('c'.repeat(32));
    });

    it('rejects a short secret', () => {
      expect(() => validateEnv({ ...valid, CRON_SECRET: 'short' })).toThrow(
        'CRON_SECRET',
      );
    });
  });

  it('BLOB_STORE_HOST is optional and must be a host name', () => {
    expect(validateEnv(valid).BLOB_STORE_HOST).toBeUndefined();
    expect(
      validateEnv({
        ...valid,
        BLOB_STORE_HOST: 'abc123.private.blob.vercel-storage.com',
      }).BLOB_STORE_HOST,
    ).toBe('abc123.private.blob.vercel-storage.com');
    for (const bad of [
      'https://abc.blob.vercel-storage.com',
      'abc',
      'a b.com',
    ]) {
      expect(() => validateEnv({ ...valid, BLOB_STORE_HOST: bad })).toThrow(
        /BLOB_STORE_HOST/,
      );
    }
  });

  it('treats BLOB_READ_WRITE_TOKEN and VERCEL as optional', () => {
    const env = validateEnv(valid);
    expect(env.BLOB_READ_WRITE_TOKEN).toBeUndefined();
    expect(env.VERCEL).toBeUndefined();
    expect(validateEnv({ ...valid, VERCEL: '1' }).VERCEL).toBe('1');
  });
});
