# Prime Property CRM

A mobile-first CRM for a real estate team: import homeowner lists, assign them across the team, call
owners from the phone and log outcomes, manage listings with photos, search them for client requests,
follow up on Property Finder ads, and see the team's activity.

- Business rules: [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md)
- Spec and API contract: [docs/specs/2026-10-22-property-crm.md](docs/specs/2026-10-22-property-crm.md)
- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Build progress: [docs/BUILD_LOG.md](docs/BUILD_LOG.md)

## Status

Version 1 is built and verified locally on `dev`: API, web app (English and Arabic, light and
dark, installable on phones), nightly backups and the Vercel setup. Not deployed yet — the first
deploy needs the Vercel account (Neon database, Blob photo storage), see
[docs/notes/deploy.md](docs/notes/deploy.md). The backup workflows are disabled until Neon and R2
exist, see [docs/notes/backups.md](docs/notes/backups.md).

## Stack

npm workspaces: `apps/api` (NestJS 11, Prisma 7, Postgres), `apps/web` (Next.js 16, Tailwind 4,
shadcn/ui), `packages/shared` (zod contract, locales, shared logic). Hosting on Vercel, Postgres on
Neon, photos in Vercel Blob, backups to Cloudflare R2.

## Run it locally

Needs Node 24 and Docker. Test logins are in `CREDENTIALS.local.md` (never committed).

```bash
npm install
npm run db:up
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:deploy -w @prime-crm/api
npm run db:seed
npm run dev:api
npm run dev:web
```

Before migrating, fill `apps/api/.env` (a long `JWT_SECRET`, the seed passwords; set
`SEED_ALLOW_SAMPLE=true` for sample data) and point `NEXT_PUBLIC_API_URL` in
`apps/web/.env.local` at the API's port. Tests and the parallel test-database setup:
[docs/notes/testing.md](docs/notes/testing.md).
