# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Prisma (apps/api)
- Prisma 7's `migrate dev` does not regenerate the client: run `prisma generate` after every schema
  change, in every worktree. — 2026-10-22
- Prisma 7 + `@prisma/adapter-pg` silently truncates a fractional value written to an `Int` column
  (1500.5 → 1500). Whole-number inputs (price) must be rejected at the DTO with `@IsInt()`. — 2026-10-22

## Transactions (apps/api)
- Inside a transaction every read goes through `tx`, never `this.prisma`: on Vercel the pool has one
  connection and an outside read deadlocks. Every backend task runs its e2e once with `VERCEL=1` to
  catch it. — 2026-10-22
- Test databases must end in `_test` (the harness refuses others); create them with
  `npm run db:agent -- create <name> --agent N` (N = 1..9). — 2026-10-22

## Agents and servers
- Briefs must tell agents to start API/web servers only with the Bash tool's `run_in_background`
  and poll readiness with a bounded loop; a foreground server (or `&` inside a foreground command)
  stalled two agents for 10+ minutes. Any single tool call over ~10 minutes trips the agent
  watchdog: prefix tests/builds/Playwright with `timeout 420`, run e2e per spec file with
  `--forceExit`. Ask for a WIP commit before long steps. — 2026-10-23
- Keep at most 3 agents that run tests or servers at once on this machine (16 GB): with 5,
  free memory fell to ~3 GB, a `next dev` grew to 3 GB, and agents stalled. Kill a stalled agent's
  servers before resuming it. — 2026-10-23
- On this machine Turbopack's Google Fonts fetch times out: build and run the web with
  `next build --webpack` / `next dev --webpack` locally (Vercel builds are unaffected). — 2026-10-23
