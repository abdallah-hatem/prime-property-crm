# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Prisma (apps/api)
- Prisma 7's `migrate dev` does not regenerate the client: run `prisma generate` after every schema
  change, in every worktree. — 2026-10-22
- Prisma 7 + `@prisma/adapter-pg` silently truncates a fractional value written to an `Int` column
  (1500.5 → 1500). Whole-number inputs (price) must be rejected at the DTO with `@IsInt()`. — 2026-10-22
