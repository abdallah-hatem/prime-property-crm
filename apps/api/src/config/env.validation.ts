import { z } from 'zod';

/** An optional variable: unset and empty both mean "not configured". */
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Every environment variable the API reads. Validated once by ConfigModule at boot:
 * a missing or malformed value stops the process before it serves a request.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    /** Shared secret Vercel crons send. Optional in dev and test, required in production. */
    CRON_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16, 'must be at least 16 characters').optional(),
    ),
    /**
     * Vercel Blob read-write token: signs the photo upload tokens. Unset = photo uploads answer
     * 503 UPLOADS_NOT_CONFIGURED (local dev without a store).
     */
    BLOB_READ_WRITE_TOKEN: optionalString,
    /**
     * Host of our Blob store (`<store id>.private.blob.vercel-storage.com`): a registered photo
     * URL must be on it. Unset = derived from BLOB_READ_WRITE_TOKEN's store id.
     */
    BLOB_STORE_HOST: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(
          /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
          'must be a host name, like abc.private.blob.vercel-storage.com',
        )
        .optional(),
    ),
    /** Set by Vercel on every deployment: the database pool shrinks to one connection. */
    VERCEL: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CRON_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['CRON_SECRET'],
        message: 'is required when NODE_ENV=production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
