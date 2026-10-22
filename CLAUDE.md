# Prime Property CRM — Project Instructions

Mobile-first CRM for a real estate team: homeowner leads, calling, listings, Property Finder ad
follow-up, admin analytics. Built with `/build-software` (fully autonomous run).

Stack: NestJS + Prisma (`apps/api`), Next.js + Tailwind + shadcn/ui (`apps/web`), shared zod schemas,
types and locales (`packages/shared`). Postgres on Neon (via Vercel), photos in Vercel Blob, nightly
backups to Cloudflare R2. English + Arabic (RTL).

## Read first
- `docs/BUSINESS_LOGIC.md` — the source of truth for how the business behaves. Every behavior change
  updates it in the same commit and bumps its `Last updated` line.
- `docs/BUILD_LOG.md` — where the run is and what is next.
- `docs/specs/` — specs; `docs/DESIGN.md` once the design system exists.

## Branches
- `production` — live. Merged only through a release PR.
- `dev` — default branch and integration; auto-deploys to the preview.
- Work on `feature/<name>`, `fix/<name>`, `chore/<name>` cut from `dev`, merged by PR.

## Secrets
- Test logins and the integrations register live in `CREDENTIALS.local.md` (gitignored). The repo is
  public: never commit a credential, key, or client data.
