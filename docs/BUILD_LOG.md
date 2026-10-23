# Build log
Run mode: fully autonomous — chosen by the user on 2026-10-22
Goal (current): a mobile-first CRM for Prime's real estate team — owner leads, calls, listings,
Property Finder follow-up, admin analytics and backups · spec `docs/specs/2026-10-22-property-crm.md`
· plan `docs/superpowers/plans/2026-10-22-property-crm.md`
Current stage: 7 — Verify done locally (unit, e2e, smoke 8 projects, UI audit + fixes) · dev pushed to GitHub · next: re-run smoke on the merged audit fixes, release alignment review, Vercel (needs access).

## Waiting on the user
- Vercel access, then Neon + Cloudflare R2: the backup and restore-drill workflows are DISABLED on GitHub (user, 2026-10-23) until those secrets exist — enable them per docs/notes/backups.md.

## Blocked
- (none)

## Next up
- Re-run the smoke specs in all 8 projects on the final dev (the audit fixes were smoke-checked in 3 projects).
- Release alignment review over everything (base e4606d1..dev), then the release PR dev → production.
- With Vercel access: create the Neon database and Blob store, deploy the preview from dev, run migrations, seed the preview, smoke against the preview URL (docs/notes/deploy.md). Then Neon + R2 secrets and re-enable the backup workflows (docs/notes/backups.md).
- Real-phone checks: install prompt (Android), Add to Home Screen (iOS), notch padding, no zoom on fields.
- Max 3 heavy agents at once; servers via run_in_background; long commands under `timeout 420` (see .claude/LEARNINGS.md).

## Phases
- Build — [waves](build-log/waves/foundation/)
- Foundation — spec, business doc, API contract · [decisions](build-log/decisions/foundation.md)
