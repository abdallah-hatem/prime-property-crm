# T0 — Foundation scaffold and design system

Branch `chore/foundation-scaffold` · 2026-10-22 · Status: done, not pushed.

## Commits

| Hash | What |
|---|---|
| `752157d` | Root: npm workspaces, `.gitattributes` (LF), `.editorconfig`, Prettier, `docker-compose.yml` (Postgres 17 on host 5442, `prime-crm-db`, volume `prime-crm-pgdata`, init script creating `prime_crm_test`) |
| `b24b2cc` | `packages/shared`: contract enums + envelope/Meta types + error codes, en/ar locales, phone normalisation with tests |
| `7e2e7b2` | `apps/api`: NestJS 11 + Prisma 7 bootstrap, envelope, coded errors, global JWT guard, health, unit + e2e tests |
| `f0648c1` | Prettier pass on shared; bidi marks in the phone regex written as `‎` escapes |
| `df5b713` | `apps/web`: Next 16, Tailwind 4, shadcn, the A1 Switchboard Soft design system, i18n, theme, `/design` |
| `571c30e` | `docs/DESIGN.md` and the `/design` screenshots |

## Versions

Next 16.4.2 · React 19.3.1 · NestJS 11.2.7 (as asked; 12.2.0 is the npm `latest`) · Prisma 7.10.1
(the npm `latest` tag points at 8.0.0-rc.25, a release candidate, so the newest stable was taken) ·
Tailwind 4.3.3 · shadcn CLI 4.22.1 (new-york, radix-ui) · TypeScript 6.0.3 (pinned: typescript-eslint
8.72 supports `<6.1`) · ESLint 9.39.5 (house config) · zod 4.6.7 · Vitest 4.1.12 · Jest 30.5.2 ·
Playwright 1.64.1 · Node 24.12.0 · npm 11.6.2.

## Checks (all run foreground at the repo root, logs kept outside the repo)

- `npm install` (clean, after deleting every `node_modules`): exit 0. 1418 packages. npm audit
  reports 27 vulnerabilities (20 moderate, 7 high) in transitive dev tooling; not force-fixed.
- `npm run lint`: exit 0 — shared, api, web all clean. Probe files confirmed the house rules fire
  (`process.env` outside config, `console`, `pl-4`, `bg-blue-500`, literal JSX text).
- `npm run typecheck`: exit 0.
- `npm test`: shared `Tests 37 passed (37)` · api `Tests: 33 passed, 33 total` (3 suites) ·
  web `Tests 4 passed (4)`.
- `npm run test:e2e -w @prime-crm/api` (against `prime_crm_test`): `Tests: 4 passed, 4 total`.
- `docker compose -p prime-crm up -d`: port 5442 was free; container healthy; both databases exist.
- API boot: `GET /api/health` →
  `{"success":true,"message":"Data retrieved successfully","statusCode":200,"data":{"status":"ok","database":"up","uptimeSeconds":1},"timestamp":"…","path":"/api/health"}`.
  Unknown route → `404` envelope with `error: "NOT_FOUND"`. A short `JWT_SECRET` stops boot with
  `Invalid environment configuration: JWT_SECRET: must be at least 32 characters`.
- `next build` (web): passes. In the production server `/design` answers 404 and a
  `prime_locale=ar` cookie renders `<html lang="ar" dir="rtl">` on the server.
- Servers stopped; `docker compose down` run; volume `prime-crm-pgdata` kept.

## What was built

**Root** — workspaces `packages/*`, `apps/*`; scripts `lint`, `typecheck`, `test` (each builds
shared first), `postinstall` builds shared and runs `prisma generate`; `db:up` / `db:down`.

**`packages/shared`** (`@prime-crm/shared`, CommonJS build to `dist/`)
- `src/contract/enums.ts` — every enum from the spec as a zod enum + type + value map.
- `src/contract/envelope.ts` — `ApiResponse`, `Meta`, `Paginated`, `PAGE_LIMIT_MAX` (20),
  `PICKER_LIMIT_MAX` (100).
- `src/contract/errors.ts` — generic `ErrorCode`s the filter emits, `ERROR_CODE_PATTERN`.
- `src/locales/en.json`, `ar.json` — app shell keys (app, nav, theme, language, today, action,
  lead/ad/listing status, error codes); identical key sets, enforced by `src/i18n.test.ts`.
- `src/i18n.ts` — `messages`, `LOCALES`, `LOCALE_COOKIE` (`prime_locale`), `isLocale`,
  `directionOf`, `keyPaths`.
- `src/logic/phone.ts` — `normalizePhone` / `toE164`: Egyptian mobile (010/011/012/015),
  Cairo 02, Alexandria 03 and two-digit area-code landlines to E.164, `+20` / `0020` prefixes,
  separators and Arabic bidi marks ignored, 12-digit and impossible-prefix numbers rejected,
  empty/null → `EMPTY`; other country codes accepted when E.164-shaped.

**`apps/api`** (`@prime-crm/api`)
- `src/config/env.validation.ts` — zod schema (`NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`
  ≥ 32 chars, `CORS_ORIGINS`), wired as `ConfigModule.forRoot({ isGlobal, validate })`.
- `src/common/` — `ResponseUtil`, `ResponseInterceptor`, `AllExceptionsFilter` (stable codes:
  status → code map, a thrown `{ error: 'DOMAIN_CODE', data }` passes through, Prisma codes mapped
  by error name so no value import of `@prisma/client` leaves the database zone, internals hidden
  in production), `createValidationPipe()` (whitelist, forbidNonWhitelisted, transform,
  `VALIDATION_FAILED`), `@Public()`, `JwtAuthGuard` (APP_GUARD), `BaseRepository` +
  `ModelDelegate`/`IRepository` (typed, no `any`; limit capped at 20).
- `src/database/` — global `DatabaseService` (PrismaClient with `@prisma/adapter-pg`,
  `isReachable()`).
- `src/domains/auth/` — `JwtStrategy` (HS256, `JWT_SECRET`), `JwtPayload`/`AuthUser` types.
- `src/domains/health/` — `GET /api/health` (`@Public`, 503 `DATABASE_UNAVAILABLE` when the
  database is down).
- `src/app.setup.ts` — prefix `api`, CORS from env, the validation pipe; shared by `main.ts` and e2e.
- `prisma/schema.prisma` (datasource + generator only), `prisma.config.ts` (Prisma 7 keeps the URL
  there).
- `test/` — `jest-e2e.json`, `setup-env.ts` (reads `DATABASE_URL`/`PORT` from env or
  `apps/api/.env.test`; refuses any database not ending in `_test`), `health.e2e-spec.ts`.
- House lint config copied verbatim from building-backends.

**`apps/web`** (`@prime-crm/web`)
- `src/app/globals.css` — all tokens for light and dark, `@theme inline` names (background,
  foreground, card, popover, secondary, muted, border, input, ring, primary + `primary-end` +
  `bg-primary-gradient`, `primary-soft`, accent, `urgency` (amber), success, warning, destructive
  with soft variants, chart-1..5), radii 12/18/24/28 + pill, shadows `soft`/`raised`/`float`/`glow`,
  `ease-snappy`, `animate-rise`, `animate-ping-soft`, `scrollbar-clean`, `type-*` scale with Arabic
  overrides, `bg-today-glow`, `flip-rtl`, reduced-motion rules.
- `src/app/fonts.ts` — Plus Jakarta Sans + IBM Plex Sans Arabic via `next/font`; the stack is led
  by the locale's face, numerals stay Jakarta (`font-numeric`).
- `src/i18n/` — `getLocale()` (cookie, server), `I18nProvider` / `useTranslation()` with typed
  keys, `setLocale` writes the cookie and refreshes.
- `src/components/` — `ThemeProvider` (next-themes, class, system, no flash), `ThemeToggle`,
  `LocaleSwitch`, generic `SegmentedControl`, `today/CounterBoard` + `CounterCard`,
  `today/OwnerRow`; restyled shadcn `ui/button` (pill; default gradient, soft, secondary,
  outline, ghost, inverse, destructive, link; 44px default), `ui/input`, `ui/card`, `ui/badge`
  (chips with dot / live ripple), `ui/label`.
- `src/lib/motion.ts`, `src/lib/utils.ts`.
- `src/app/design/` — dev-only style guide (404 in production): palette light + dark with live
  values, type scale EN + AR, buttons, chips, inputs, cards, the three counter cards and an
  overdue owner row in a 390px Today preview.
- Vitest + RTL: `src/components/theme-toggle.test.tsx` (dark/light switch, persisted, system,
  Arabic). Playwright installed; `playwright.config.ts` reads `WEB_PORT` or
  `PLAYWRIGHT_BASE_URL`; `e2e/` empty.
- House lint config copied verbatim from building-frontends.
- `next.config.ts` sets `experimental.turbopackFileSystemCacheForBuild: false`.

**Docs** — `docs/DESIGN.md` (feel, layout, colour roles, type, radius, shadow, motion, don'ts; no hex).

## Screenshots of /design (`docs/design/screenshots/`)

Mobile 390px (full page, 2x): `design-mobile-light-en.png`, `design-mobile-dark-en.png`,
`design-mobile-light-ar.png`, `design-mobile-dark-ar.png`. Desktop 1280px: `design-desktop-light-en.png`,
`design-desktop-dark-en.png`, `design-desktop-light-ar.png`, `design-desktop-dark-ar.png`. Close-ups:
`design-today-mobile-light-en.png`, `design-today-mobile-dark-ar.png`. No horizontal overflow and no
console errors at either width in any of the eight runs. The counters, owner row, pill chips, gradient
Call button and soft shadows match the mockup; the row's marker, Call button and the header glow
mirror in Arabic.

## Decisions and deviations

- **Amber is `urgency`, not `accent`.** shadcn uses `accent` for every hover and menu highlight; mapping
  amber there would paint all hovers amber. `accent` is a faint indigo; amber has its own role.
- **AA tuning.** Light success, warning and danger were deepened slightly from the mockup so chip text
  passes 4.5:1; dark primary-soft text has its own lighter token. Danger on danger-soft passes only
  at large size (the overdue counter) — noted in DESIGN.md.
- **Error codes.** Nest's own exceptions carry a human phrase in `error` ("Not Found"); the filter only
  passes UPPER_SNAKE codes through and otherwise maps the status, so `error` is always stable.
  Unknown Prisma codes map to `DATABASE_ERROR` rather than the raw `P20xx`.
- **BaseRepository takes the model delegate** (`super(db.owner)`) instead of a model-name string, so it
  is typed without `any`. It is verified against Prisma's generated delegates only once the first
  model exists.
- **`/design` copy** lives in `src/app/design/samples.ts` (sample data), not in the product locale files.
- **`apps/web/AGENTS.md`** is generated by `next dev` (Next 16) and committed so the tree stays clean.
- **Local env files.** `apps/api/.env` and `.env.test` were created for the run with random secrets and
  then deleted; copy `apps/api/.env.example` / `.env.test.example` and fill `JWT_SECRET` to run locally.
  The compose file uses Postgres' local default password, which is not a secret.

## Not done / follow-ups

- The browser pane rendered the mockup too small to compare pixel by pixel; the comparison was made
  against the mockup's CSS and Playwright screenshots of `/design`.
- The bottom tab bar, sheets and the listing screen from the mockup are not built yet (not in scope).
- `npm audit` findings in dev tooling are untouched.
