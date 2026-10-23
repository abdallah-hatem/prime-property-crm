# Deploying to Vercel

Two Vercel projects from this one repository, both built by Vercel from GitHub pushes:

| Project | Root Directory | Framework preset | Config |
|---|---|---|---|
| `prime-crm-api` | `apps/api` | NestJS | `apps/api/vercel.json` |
| `prime-crm-web` | `apps/web` | Next.js | `apps/web/vercel.json` |

**What the owner must provide:** access to the Vercel account (or team) that will own the projects
and pay for them (Pro plan for the ~45 USD/month budget), and admin on the GitHub repository so
Vercel can be connected. Everything else below is created from that access. No value is ever
committed: secrets go into Vercel and GitHub only, and each resource is recorded in
`CREDENTIALS.local.md` (gitignored) as it is created.

## How the build works

- Vercel installs from the **repo root** (npm workspaces, root `package-lock.json`). The root
  `postinstall` already builds `packages/shared` and runs `prisma generate`; the build commands do
  both again explicitly so a skipped install hook can never ship a missing client.
- API build: `npm run build:shared` → `prisma generate` → `nest build`. The NestJS preset runs
  `src/main.ts` as is (`app.listen`); there is **no** serverless adapter or `api/index.ts`.
- Web build: `npm run build:shared` → `next build`.
- **Migrations are not run by any build.** Applying them is a deliberate step (below), against the
  unpooled URL, so concurrent preview builds never race on a live database.
- In each project, Settings → General → Root Directory: set as above, and keep **"Include files
  outside the root directory in the Build Step"** on (the apps import `packages/shared`).
- Region `fra1` (Frankfurt) on both: create the Neon database in AWS `eu-central-1` to match, the
  closest pair to Cairo.

## Scheduled jobs (API project)

| Path | Schedule (UTC) | Cairo | Does |
|---|---|---|---|
| `/api/internal/cron/purge` | `0 1 * * *` | 03:00 (04:00 in summer time) | Purges records and photos trashed more than 30 days ago |
| `/api/internal/cron/ad-check-ins` | `0 4 * * *` | 06:00 (07:00 in summer time) | Safety net for open ad check-ins |

Vercel cron schedules are UTC only; Egypt's summer time shifts both jobs one hour later, which is
harmless for housekeeping. Two daily crons fit even the Hobby limit.

Vercel calls each path with **`GET`** and `Authorization: Bearer $CRON_SECRET`. The endpoints must
accept GET and must refuse when `CRON_SECRET` is unset (not just when it mismatches).

## Environment variables (names only)

Set each for **Production and Preview** separately (`vercel env ls` from the app folder shows the
scope). After changing one, redeploy with `vercel deploy --prod` or a push — `vercel redeploy`
reuses the old build and does not pick it up.

### API (`apps/api`)

| Name | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Neon integration | Pooled endpoint; used by the app |
| `DATABASE_URL_UNPOOLED` | Neon integration | Migrations and backups only |
| `JWT_SECRET` | generate, ≥ 32 chars | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGINS` | web project URL(s) | Comma-separated, e.g. the production domain and the preview domain |
| `CRON_SECRET` | generate, ≥ 32 chars | Vercel sends it to the cron paths |
| `BLOB_READ_WRITE_TOKEN` | `vercel blob create-store` | Private store for listing photos |
| `PORT` | `3000` | Required by `env.validation.ts` today; see the follow-up in the T19 report |
| `NODE_ENV` | set by Vercel | `production` |

The Neon integration also writes ~18 other `PG*` / `POSTGRES_*` variables; they are unused.

### Web (`apps/web`)

| Name | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | API project URL + `/api` | Baked in at build time: set before the first web build; changing it needs a rebuild |

### GitHub Actions secrets (backups)

`DATABASE_URL` (the Neon **unpooled** URL), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optionally `R2_ADMIN_ACCESS_KEY_ID` /
`R2_ADMIN_SECRET_ACCESS_KEY`. See `docs/notes/backups.md`. Both backup workflows are **disabled**
on GitHub until these secrets exist; enable them after adding the secrets (commands in
`docs/notes/backups.md`).

## First deploy runbook

Run from the **main checkout**, not a worktree: a worktree has no `.vercel/` link, so the CLI
finds no project (or copy each app's `.vercel/project.json` from the main checkout).

1. **Pick the scope.** `vercel login`, then `vercel teams ls` and `vercel projects ls` to find the
   team that should own the projects. Use that `--scope` on every command below.
2. **Create and link the API project.**
   ```bash
   cd apps/api
   vercel link --yes --project prime-crm-api --scope <team>
   ```
   `vercel link` appends bare `.env*` lines to `.gitignore`; keep the `!.env.example` lines after them.
3. **Neon through the marketplace.** From `apps/api`: `vercel integration add neon` — choose region
   AWS `eu-central-1`, Postgres 17, the Launch plan (7-day point-in-time restore). It writes
   `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` to the project.
4. **Blob store.** From `apps/api`:
   `vercel blob create-store prime-crm-photos --access private --yes` (writes
   `BLOB_READ_WRITE_TOKEN`). Private, because the photos are behind the app's permissions.
5. **Remaining API variables.** `vercel env add JWT_SECRET production` (and `preview`), the same for
   `CRON_SECRET`, `PORT` (`3000`) and `CORS_ORIGINS` (fill once the web URL is known; use the
   expected production domain now).
6. **Connect GitHub** in the dashboard (Project → Settings → Git): production branch `production`,
   previews from `dev` and PRs. Set Root Directory `apps/api`. Deploy by pushing (or
   `vercel deploy --prod` from `apps/api`).
7. **Migrate, deliberately.** From `apps/api` in the main checkout:
   ```bash
   vercel env pull .env.production.local --environment=production
   # then, with DATABASE_URL set to the DATABASE_URL_UNPOOLED value from that file:
   DATABASE_URL="<unpooled url>" npx prisma migrate deploy
   DATABASE_URL="<unpooled url>" npm run db:seed   # once T2's seed exists: roles, outcomes, settings, first admin
   rm .env.production.local
   ```
   Repeat for the preview database if previews use a separate Neon branch.
8. **Smoke-check the API** — Ready in the dashboard proves only that it compiled:
   ```bash
   curl -sS https://<api-domain>/api/health          # expect success:true, database:"up"
   curl -sS -o /dev/null -w '%{http_code}\n' https://<api-domain>/api/internal/cron/purge   # expect 401
   ```
   Then read **Runtime Logs** (not the build log) for one request. A 500 on every route: check
   for an ESM-only dependency (`ERR_REQUIRE_ESM`), then a missing Prisma client, then an env var
   set for the wrong environment. A request that hangs ~60s: the connection pool (see follow-ups).
9. **Create and link the web project.**
   ```bash
   cd ../web
   vercel link --yes --project prime-crm-web --scope <team>
   vercel env add NEXT_PUBLIC_API_URL production   # https://<api-domain>/api
   ```
   Connect GitHub the same way, Root Directory `apps/web`, then deploy.
10. **Close the loop.** Put the web domain(s) into the API's `CORS_ORIGINS`, then
    `vercel deploy --prod` from `apps/api` (not `redeploy`). Prefer custom domains for both from
    the start so a later API redeploy never forces a web rebuild.
11. **Smoke-check the web**: open it on a phone, sign in as the seeded admin, confirm the Today
    screen loads data (an API call with no CORS error in the console), switch to Arabic.
12. **Crons**: Project → Settings → Cron Jobs lists both paths. Trigger each once from there and
    check its Runtime Log shows a 200 with the job's result.
13. **Blob privacy**: upload one photo, then fetch its blob URL without auth — expect 401/403.
14. **Backups**: follow `docs/notes/backups.md`, run the Backup workflow by hand, then the restore
    drill.

Record in `CREDENTIALS.local.md` as you go: team/scope, both project names and ids, Neon project
and region, Blob store name and id, which variables exist in which environment, R2 bucket and token
names.
