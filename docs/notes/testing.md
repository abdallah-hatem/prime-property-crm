# Testing

Three tiers: unit (`npm test`), API e2e against a real database (`npm run test:e2e`), and
Playwright smoke specs in `apps/web/e2e` (`npm run test:smoke`). Everything that could collide
between two runs — the database, the API port, the web port — comes from the environment.

## Local infra

`npm run db:up` starts Postgres 17 (`prime-crm-db`, host port **5442**). Databases on it:

| Database | What it is | Who writes it |
|---|---|---|
| `prime_crm` | development | you, `npm run db:seed` |
| `prime_crm_test` | the default e2e database | `npm run test:e2e` (teardown deletes rows) |
| `prime_crm_template` | migrated + foundation-seeded template for agent databases | `npm run db:agent -- template` |
| `prime_crm_<name>_test` | one per parallel agent, copied from the template | that agent only |

The e2e harness (`apps/api/test/setup-env.ts`) refuses any database whose name does not end in
`_test`, so the dev database can never be the target of a teardown.

## Parallel agents: own database, own ports

Each agent N (1–9) gets a port block: **API `31N1`, web `31N3`** (agent 2 → API 3121, web 3123).
`npm run db:agent -- ports N` prints it.

```bash
# 1. Create the agent's database from the template (refreshes the template first:
#    migrate deploy + foundation seed). Prints the env lines to use.
npm run db:agent -- create t5 --agent 5
#   DATABASE_URL=postgresql://…/prime_crm_t5_test?schema=public
#   PORT=3151  API_PORT=3151  WEB_PORT=3153  BASE_URL=http://localhost:3153

# 2. API e2e against it (bash; in PowerShell set $env:DATABASE_URL / $env:API_PORT first)
DATABASE_URL="<printed url>" API_PORT=3151 npm run test:e2e

# 3. Optional sample data on it (accounts + records in every state)
DATABASE_URL="<printed url>" npm run db:seed

# 4. Servers on its own ports only
DATABASE_URL="<printed url>" PORT=3151 npm run dev:api
WEB_PORT=3153 API_PORT=3151 npm run test:smoke      # Playwright starts next dev on 3153

# 5. Tear down only what it created
npm run db:agent -- drop t5
```

- `create` holds a Postgres advisory lock while it refreshes the template and copies it, so two
  agents creating at once queue for a few seconds instead of failing. `--no-refresh` skips the
  template refresh when it already exists.
- `drop <name>` drops only `prime_crm_<name>_test` (`WITH (FORCE)`); it cannot reach `prime_crm`,
  `prime_crm_test` or the template. `list` shows the agent databases.
- The script reads the server (host, port, credentials) from `DB_SERVER_URL` or from
  `DATABASE_URL` in `apps/api/.env` — never from the ambient `DATABASE_URL`, which may already
  point at another agent's database.
- After a new migration lands, the next `create` (or `npm run db:agent -- template`) brings the
  template up to date. Existing agent databases are migrated by the e2e global setup
  (`prisma migrate deploy`) on their next run.
- Agents stop only the servers they started, on their own ports.

## API e2e

`npm run test:e2e` (root) builds `packages/shared` and runs `apps/api` jest e2e serially
(`--runInBand`) against `DATABASE_URL`. Env (unset values are filled from `apps/api/.env.test`):

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | the e2e database; must end in `_test` |
| `PORT` or `API_PORT` | the port specs that listen bind (`PORT` wins) |
| `JWT_SECRET` | ≥ 32 characters (`.env.test`) |

`test/global-setup.ts` runs `prisma migrate deploy` on that database first. Each spec seeds what it
needs and deletes it in `afterAll`. `test/seed.e2e-spec.ts` creates and drops a scratch database
of its own (`<db>_seed_<pid>`) to prove the sample seed is idempotent.

## Seed

`npm run db:seed` (root or `-w @prime-crm/api`) runs `apps/api/prisma/seed.ts`:

1. **Foundation** (`seed-foundation.ts`) — always: roles Admin and Team member, the ten default
   call outcomes, the settings row, the first admin (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`,
   optional `SEED_ADMIN_NAME`). Safe on production.
2. **Sample** (`seed-sample.ts`) — only when `SEED_ALLOW_SAMPLE=true`; with `NODE_ENV=production`
   it refuses (exit 1, before anything is written). Unset flag = skipped with a message. Needs
   `SEED_MEMBER_PASSWORD` too.

Sample content: `admin@prime.test` (Admin), `sara@prime.test` and `omar@prime.test` (Team member),
`layla@prime.test` (custom role **Team lead**: `owners.assign` + `analytics.view`),
`karim@prime.test` (deactivated). 60 owners (Arabic and English names; New Cairo, Fifth
Settlement, Sheikh Zayed, Madinaty, 6th October, Maadi; every lead status; 1–3 phones; 6
unassigned; 5 Do not call; 12 from one finished import with 2 duplicates and 1 rejected row; one
trashed 5 days ago). Calls with every default outcome plus one with no outcome ("Outcome missing").
Reminders overdue, due today (Cairo), upcoming, done, and one unassigned open reminder. 20
listings: sale and rent, all 11 types, all 4 statuses, ads Not posted / Live (one check-in overdue,
others fine) / Taken down, one open "Take down the ad" task, 8 linked to LISTED owners and 12
direct, photos pointing at placehold.co, one trashed listing and one trashed photo. Activity
entries for user and role creation, the import, assignments, the deactivation hand-over, the two
deletions and an export.

Every sample row has a fixed id (`sampleId(kind, key)`) or a natural key (users by email, the role
by name) and is upserted back to its fixture state, with times relative to now — so a re-seed
changes no counts and makes "overdue" / "due today" true again. A sample account's password is
re-hashed only when it no longer matches the env value. Re-seed before a flow that needs the
fixture state; rows created by people or tests are never touched.

The logins live in `CREDENTIALS.local.md` (gitignored); passwords are only ever in env files.

## Playwright smoke specs (`apps/web`)

- `e2e/auth.setup.ts` signs in once per role (`admin`, `member` = Sara, `lead` = Layla) through
  the test ids `login-email`, `login-password`, `login-submit`, and saves
  `e2e/.auth/<role>.json`. Passwords from `SEED_ADMIN_PASSWORD` / `SEED_MEMBER_PASSWORD`.
- Projects: `mobile` (iPhone 13) and `tablet` (iPad gen 7) × `en` / `ar` × `light` / `dark`, all
  on Chromium, each depending on `auth`. `e2e/fixtures.ts` sets the `prime_locale` cookie from the
  project, and `shotPath()` puts screenshots under `e2e/shots/<project>/`.
- `e2e/.auth/` and `e2e/shots/` are gitignored (saved sessions are live tokens).
- **Until T12 ships the login page**, the setup and the placeholder smoke spec are `fixme`
  (skipped). T12 sets `LOGIN_PATH` in `e2e/accounts.ts`, removes the two `fixme`s and gives the
  shell the `app-shell` test id (or changes the spec).
- `npm run test:smoke` runs `--grep @smoke`; production runs `--grep @readonly` with `BASE_URL`.
