# Decisions — foundation

- **[Stage 1] Platform: responsive web (PWA), no native apps** — the team calls from phones through
  `tel:` links; the proposal promises a mobile-friendly web app.
  Why: covers phones, tablets and desktop with one codebase inside the 4–5 week timeline.
  Alternatives: Expo app for iOS/Android.
- **[Stage 1] Backend: NestJS API in this repo; Neon Postgres through Vercel; Vercel Blob for photos**
  Why: the owner's house stack; chosen in conversation on 2026-10-21.
  Alternatives: Supabase.
- **[Stage 1] Languages: English and Arabic with RTL** — chosen by the user on 2026-10-22.
- **[Stage 1] Single tenant** — one company, Prime.
  Why: the request is for Prime's own team. Alternatives: multi-tenant SaaS.
- **[Stage 1] Backups: nightly `pg_dump` via GitHub Actions to Cloudflare R2 free tier, 30-day lifecycle
  rule; photos not backed up, protected by 30-day delayed deletion** — chosen by the user on
  2026-10-21. Alternatives: photos in R2 with versioning; single overwritten copy (rejected: a
  mistake noticed late would be copied into the only backup).
- **[Stage 2] Roles as permission sets, Admin and Team member built in** — the request says the admin
  "sets roles and permissions".
  Alternatives: two fixed roles only.
- **[Stage 2] Owner phone visibility on listings follows the listing's assigned member** — the request:
  "see all the data except the phone number of the owner, unless this home was assigned to him".
- **[Stage 2] Duplicate detection by normalised phone, Egypt +20 default**
  Why: phone is the one field every sheet has; names vary in spelling.
  Alternatives: name + phone; no dedupe.
- **[Stage 2] Google Sheets via exported file, not a live connection**
  Why: the request says "bulk upload"; a live sync needs Google OAuth and adds scope.
- **[Stage 2] Default call outcomes** — No answer, Busy, Switched off, Wrong number, Interested to sell,
  Interested to rent, Not interested, Call back later, Already sold or rented, Do not call again;
  admin-editable. Why: the request lists "didn't pick up, interested, not interested, etc."
- **[Stage 2] Ad check-in every 7 days, admin-adjustable**
  Why: the request says the team must "constantly contact the owner"; weekly is a common cadence.
- **[Stage 2] Deactivating a member forces a hand-over choice** so no owner is left with nobody.
- **[Stage 2] Reminders in-app only for v1; push/email Planned** — keeps the timeline.
- **[Stage 2] Spec and business doc self-approved** — fully autonomous run.
- **[Stage 3] API contract written into the spec** — every endpoint, body, response shape and
  error code; zod schemas in `packages/shared` are the single source both sides import.
- **[Stage 3] Auth: 15-minute JWT + 30-day rotating refresh token, user re-checked as active on
  every request** — deactivation and password reset bite immediately.
  Alternatives: long-lived JWT (deactivation would lag); server sessions.
- **[Stage 3] Someone else's owner answers 404, not 403** — ids can't be probed.
- **[Stage 3] Default outcome → status mapping** — No answer/Busy/Switched off → Contacted;
  Wrong number → Do not call; Already sold or rented → Not interested. No outcome can set Listed.
  Why: a wrong number should leave the calling list; only a listing makes an owner Listed.
- **[Stage 3] Calling-list order** — overdue reminder, due today, New, Call back, Contacted,
  Interested, Not interested; oldest last call first. Not interested stays in the list (the business
  doc only removes Listed and Do not call), at the bottom.
- **[Stage 3] Ad check-in records "still available?"; No → Off market + take-down task.**
  An ad can go Live only on an Available listing.
- **[Stage 3] Deleting a listing returns its owner to Interested; an owner with a listing can't be
  deleted first.** Keeps the "Listed" flag truthful.
- **[Stage 3] Imports parsed on upload and staged in the database** — Vercel functions have no
  durable disk. Limits 4 MB / 20 000 rows (Vercel's 4.5 MB body limit).
- **[Stage 3] Photos upload browser → Vercel Blob directly**, resized to 2560 px and HEIC converted
  in the browser; 30 photos per listing.
- **[Stage 3] Purge and ad check-in safety net as daily Vercel crons.**
- **[Stage 4] Design: user likes direction A (Switchboard) layout, rejects its boxy style** — 2026-10-22.
  Two modern restylings mocked (A1 Soft, A2 Sleek).
- **[Stage 4] Look approved by the user: A1 Switchboard Soft** — 2026-10-22. Plus Jakarta Sans +
  IBM Plex Sans Arabic, indigo-cobalt gradient, 12/18/24px radii, soft layered shadows, amber only for
  urgency, 200–250ms ease-out. Reference mockup: `docs/design/approved-direction-a1-soft.html`.
- **[Run mode] User re-confirmed fully autonomous on 2026-10-22: "go ahead and implement, don't wait
  for me, you approve".** Gates are self-approved; money, access and irreversible data loss still stop.
- **[Stage 5] Plan written and self-approved** — `docs/superpowers/plans/2026-10-22-property-crm.md`,
  20 tasks (T0–T19) with classes, dependencies and edge cases.
- **[Stage 5] Deactivation with no recipient leaves open reminders unassigned**; they follow the
  owner/listing to its next member. Alternatives: close them (loses follow-ups); give them to the admin.
- **[Stage 5] Restoring a photo of a deleted listing → 409, restore the listing first.**
- **[Stage 5] Calls keep an owner-name snapshot** so purging an owner after 30 days never deletes calls.
- **[Stage 5] Alignment review round 1: CONFLICTS → resolved** (business doc wins; gaps decided):
  - Reminders can be unassigned (`member: null`) and follow their owner/listing.
  - Only `owners.assign` holders set an assignee anywhere (create owner, create listing); PATCH
    listing can't reassign. An owner and its listing always share a member.
  - Leaving Available closes the open check-in; the safety-net cron skips non-Available listings;
    deleting an owner or listing closes its open reminders.
  - Trashed owners keep their phones until purge (`409 PHONE_IN_TRASH`). Alternatives: release the
    phone on delete (restore could then conflict). Why: restore always works and dedupe stays strict.
  - Price capped at 1,000,000,000 EGP (fits `Int`).
  - Call start is idempotent by `clientRequestId`; a late outcome on an older call never overrides
    the status set by a newer one.
  - `PHONE_EXISTS` reveals ids only to `owners.viewAll` holders.
  - Do not call: member can set on own owner, only admin clears (→ Contacted).
  - T12 auth routing and T19 backups reclassified to `logic` with cases (restore drill).
  - Business doc gained: Note entity, full activity list, reactivation and password reset, restore
    side effects, invariants for ad Live and take-down tasks.
- **[Stage 5] Alignment review round 2: 5 small gaps (activity cases, import assign permission, note immutability, price bounds, restore of non-trashed) added → plan self-approved as ALIGNED.**
