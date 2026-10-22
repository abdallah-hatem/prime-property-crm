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
- T2 merged (5337ef2) after verify (lint/tc 0; unit pass; e2e 33/33). Agent DBs: `npm run db:agent -- create <name> --agent N` → prime_crm_<name>_test, ports 31N1/31N3.
- T3 merged (f242937) after verify on merged dev (lint/tc 0; unit 43+111+4; e2e 79/79, also with VERCEL=1) and alignment review ALIGNED.
- Wave 4: T4 auth alone (T5, T6, T12 all depend on it).
- T4 merged (1451633). Verify on merged dev: lint/tc 0; unit 46+175+4; e2e 103/103 x3 (+VERCEL=1). First cold run timed out in hooks (scrypt) → e2e testTimeout 30s (3dae2a8). Alignment: DOC OUT OF DATE → doc + contract updated (sid, 30 s grace, family revoke, success clears count).
- Wave 5: T5 users-roles (agent 5) ∥ T6 owners (agent 6) ∥ T12 web shell (agent 2) · T5/T6 both add a module to app.module.ts and exports to packages/shared index (additive; merge by hand) · T12 web only
- T5 merged (6a087c1) · review DOC OUT OF DATE → contract gains 400 INVALID_ROLE.
- T12 merged (2e18be8) · verify: lint/tc 0, web 29 tests, next build ok.
- T6 merged · conflicts additive (app.module, contract index, doc header); duplicates unified: IsPhone/DistinctPhones in common/validators/is-phone.validator.ts, IsOptionalNotNull in common/validators/optional-not-null.validator.ts, one UserSummarySchema (summary.ts), one PhoneInputSchema (auth.ts). Merged verify: unit 52+390+29, e2e 186/186 (+VERCEL=1).
- Wave 6: T7 calls-reminders (agent 7) ∥ T18 PWA (agent 3) · T6 alignment review running.
