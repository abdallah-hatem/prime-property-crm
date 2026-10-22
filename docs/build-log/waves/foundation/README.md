# Waves — foundation

- Wave 1: T0 alone (everything depends on it) · branch chore/foundation-scaffold in .claude/worktrees/scaffold
- Wave 2: T1 data model ∥ T19 backups + Vercel config (T19 touches no schema or package files) · T0 merged into local dev (bde466f), verified: lint 0, typecheck 0, tests 37+33+4 pass
- T19 merged into local dev. Follow-ups queued (existing files T19 couldn't touch), done in T3 / T11 / chore after T1:
  - cron endpoints accept GET (Vercel crons) and refuse when `CRON_SECRET` is unset → T11
  - `env.validation.ts`: `PORT` default 3000; add `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`; `.env.example` gains `CRON_SECRET`, `DATABASE_URL_UNPOOLED` → T3 (env), T8 (Blob)
  - `database.service.ts`: on Vercel pass `max: 1, connectionTimeoutMillis: 20000` to `PrismaPg` → T3
  - backup scripts never run against a real DB yet → verify at first deploy (needs Neon + R2)
- T1 merged (a6cb858) after verify (lint/tc 0; unit 43+50+4; e2e 21) and alignment review (DOC OUT OF DATE → doc updated on the branch).
- Wave 3: T2 test infra ∥ T3 common core · T2 owns prisma/seed*, test harness, playwright, scripts/db-*; T3 owns src/common, env validation, database.service · both may add package.json scripts (merge by hand) · T3 uses its own DB prime_crm_t3 + ports 3111/3113 until T2 lands isolation
