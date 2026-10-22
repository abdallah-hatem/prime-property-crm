import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI configuration. DATABASE_URL comes from the environment (apps/api/.env locally);
// `prisma generate` only needs it to be parseable, so a placeholder is used when it is absent.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://placeholder:placeholder@localhost:5442/placeholder',
  },
});
