# Prime Property CRM — Build plan

Spec and contract: `docs/specs/2026-10-22-property-crm.md` · Business rules: `docs/BUSINESS_LOGIC.md`
· Design: `docs/DESIGN.md` (from T0) · Decisions: `docs/build-log/decisions/foundation.md`

Every task: branch `feature/<name>` (or `chore/`), one commit per task, `lint` + `typecheck` + its
tests green before commit. Class rules: `logic` → unit test per edge case below (named after it) +
full-flow e2e + alignment review; `ui` → component tests for behavior + smoke spec; `surface` → none.

Generic checklist cases (`building-backends` → testing.md) apply to every backend task in addition
to the cases listed: validation rejection (missing / extra / wrong-type field), no token → 401,
pagination (page 0, past the end, limit over cap, empty), search text with `%` `_` quotes, Arabic
and emoji text, deleted id → 404. They are tested once per endpoint group, not re-listed below.

## Tasks

| # | Task | Area | Class | Depends on | Branch |
|---|---|---|---|---|---|
| T0 | Monorepo scaffold, API bootstrap, design system in code, `DESIGN.md` | infra · frontend | surface | — | `chore/foundation-scaffold` |
| T1 | Data model: full Prisma schema, first migration, seed foundation (roles, outcomes, settings, admin) | backend | logic | T0 | `feature/data-model` |
| T2 | Test infra: isolated e2e (per-agent DB from template + port blocks), seed for every flow, `CREDENTIALS.local.md`, Playwright sign-in setup | infra | surface | T1 | `chore/test-infra` |
| T3 | Common: permissions guard + decorator, ownership helpers, activity-log writer, soft-delete + trash core | backend | logic | T1 | `feature/common-core` |
| T4 | Auth: login, refresh rotation with grace window, logout, me, change password, rate limit | backend | logic | T1, T3 | `feature/auth` |
| T5 | Users and roles (without deactivation hand-over) | backend | logic | T4 | `feature/users-roles` |
| T6 | Owners: list, calling list, ids, create, get, update, delete, assign, notes, timeline, areas lookup | backend | logic | T4 | `feature/owners` |
| T7 | Calls, call outcomes, reminders, `/me/today` | backend | logic | T6 | `feature/calls-reminders` |
| T8 | Listings: CRUD, search, status, ad lifecycle + check-ins, assign, notes, photos (Blob client upload) | backend | logic | T7 | `feature/listings` |
| T9 | Imports: upload/parse, mapping, preview, confirm (owners and listings) | backend | logic | T8 | `feature/imports` |
| T10 | Deactivate / reactivate with hand-over; trash list + restore; activity endpoint; settings | backend | logic | T8 | `feature/admin-ops` |
| T10b | Race fix: deactivation locks the user row (FOR UPDATE) before reading their work; `UserDirectoryRepository.findActive` inside a tx takes FOR SHARE, so an assignment racing a deactivation is either refused or handed over | backend | logic | T10 | `fix/assign-deactivate-race` |
| T11 | Analytics, Excel exports, crons (purge, ad check-in safety net) | backend | logic | T8 | `feature/analytics-exports` |
| T12 | Web shell: middleware auth routing + in-place refresh, `apiFetch`/`callApi`, login, app layout (bottom nav on phones, sidebar on desktop), language + theme, shared components (page header, list/table, status chip, counter card, empty state, confirm dialog, phone input, money and date display, skeletons) | frontend | logic (auth routing, refresh) + ui | T0, T4 | `feature/web-shell` |
| T13 | Today + calling list + owner detail + call flow (tel:) + outcome sheet + reminders screens | frontend | ui | T12, T7 | `feature/web-calling` |
| T14 | Listings: client search with filters, listing detail (phone hidden rule), create/edit form, photo upload + reorder, ad panel + check-in + take-down task | frontend | ui | T12, T8 | `feature/web-listings` |
| T15 | Admin owners: table, filters, select-all / next N, assign; import wizard (upload → map → preview → confirm → report) | frontend | ui | T12, T9 | `feature/web-owners-admin` |
| T16 | Admin: users (create, edit, reset password, deactivate with hand-over), roles editor, call outcomes, settings, trash, activity log | frontend | ui | T12, T5, T10 | `feature/web-admin` |
| T17 | Analytics dashboard + exports | frontend | ui | T12, T11 | `feature/web-analytics` |
| T18 | PWA: manifest, icons, theme colour, install prompt, `mobile-native` checklist | frontend | surface | T12 | `chore/pwa` |
| T19 | Backups workflow (`pg_dump` → R2, 30-day lifecycle), Vercel config (monorepo, crons, env), deploy docs | infra | logic (restore drill) | T1 | `chore/deploy-infra` |

Shared building blocks are their own tasks so parallel agents don't each build one: T3 (guards,
activity, trash core) before every backend domain; T12 (shared UI) before every screen.

## Waves (planner's guess — the parallel check decides)

- Wave 1: T0
- Wave 2: T1
- Wave 3: T2 ∥ T3 ∥ T19 (T2 owns `prisma/seed` and the e2e harness; T3 owns `src/common`)
- Wave 4: T4 · then T5 ∥ T6 · T12 once T4 lands (T12 ∥ T5 ∥ T6)
- Wave 5: T7 ∥ T18
- Wave 6: T8 ∥ T13
- Wave 7: T9 ∥ T10 ∥ T11 ∥ T14 (T9/T10/T11 each add a module to `app.module.ts` — additive)
- Wave 8: T15 ∥ T16 ∥ T17 (separate route folders; locale keys in separate namespaces)

`schema.prisma` is owned by T1. A later task that needs a column adds its own migration and goes
alone in its wave against any other schema-changing task.

## Edge cases — `logic` tasks

### T1 — Data model
- [ ] Two owners with the same normalised phone → DB unique violation (invariant: no two owners share a phone)
- [ ] Same phone on an owner's second phone slot as another owner's first → violation (invariant: phones unique across all slots)
- [ ] A call row cannot be deleted through the repository layer (no delete method) (invariant: calls never deleted)
- [ ] Activity entries have no update/delete path (invariant: activity log immutable)
- [ ] Seed is idempotent: running it twice leaves one Admin role, one Team member role, the 10 default outcomes, one settings row (checklist: duplicates)
- [ ] Default outcomes map exactly as the business doc table (business doc: default outcomes)
- [ ] Price stored as integer EGP; a fractional price is rejected by the DTO layer later, schema has `Int` (money: whole EGP)
- [ ] Price over 1,000,000,000 EGP → 400 at the DTO, never a DB overflow 500 (money: whole EGP; review)
- [ ] Foreign keys from Call (owner, member, outcome) and ActivityEntry (actor) don't cascade: deleting the parent row at DB level fails (invariant: calls/activity never deleted)
- [ ] A trashed owner still holds its phones: inserting a new owner with that phone violates the unique index (decision: trashed owners keep their phone)

### T3 — Common core
- [ ] Endpoint with `@RequirePermission('x')` and a user without `x` → 403 (role: permissions enforced by API)
- [ ] Admin role always passes every permission check, even a permission added to the list later (role: Admin has everything)
- [ ] Ownership helper: member asking for someone else's owner → NotFound, not Forbidden (contract: not yours = 404)
- [ ] Activity writer inside a transaction rolls back with it (checklist: half-applied writes)
- [ ] Soft-deleted rows excluded from every default query (contract: soft delete → 404)
- [ ] Trash core computes `purgeAt = deletedAt + 30 days` (business: restorable for 30 days)
- [ ] Restore after `purgeAt` → 410 PURGED (business: then removed for good)
- [ ] Custom role with only `owners.assign` passes that check and is refused every other permission (role: custom roles)

### T4 — Auth
- [ ] Correct email + password → tokens and `Me` with permissions (flow: sign-in)
- [ ] Wrong password, unknown email, deactivated user → identical 401 INVALID_CREDENTIALS (invariant: deactivated can't sign in; contract: no enumeration)
- [ ] Email matched case-insensitively and trimmed (checklist: whitespace)
- [ ] 11th failed attempt within 15 min → 429 (contract: rate limit)
- [ ] Refresh rotates: old token reused after the grace window → 401 and the whole family revoked (contract: rotation)
- [ ] Two refreshes with the same token within 30 s → both succeed (frontend rule: concurrent refreshes)
- [ ] Deactivated user's valid access token → 401 on next request (contract: active re-checked every request)
- [ ] Password reset by admin revokes all refresh tokens (contract)
- [ ] Change password with wrong current → 400 WRONG_PASSWORD; new < 8 chars → 400 (contract)
- [ ] `PATCH /auth/me` cannot change role, email or active (checklist: extra fields rejected)

### T5 — Users and roles
- [ ] Member without `users.manage` calls any `/users` endpoint → 403 (role)
- [ ] Create user with an existing email (different case) → 409 EMAIL_TAKEN (checklist: duplicates)
- [ ] Moving the last active admin to another role → 409 LAST_ADMIN (invariant: always one active admin)
- [ ] Two admins demote each other concurrently → at least one admin remains (invariant + checklist: concurrency)
- [ ] Editing Admin role's permissions → 400 BUILT_IN_ROLE; renaming Team member allowed (business: built-in roles can't be deleted)
- [ ] Delete a built-in role → 400; delete a role with users → 409 ROLE_IN_USE (business + contract)
- [ ] Create role with an unknown permission key → 400 (contract: fixed list)
- [ ] Permission change reflected in the next access token (contract)
- [ ] Every user/role change writes an activity entry (business: activity log)
- [ ] Member calls `/roles` and `/roles/permissions` → 403 (role)

### T6 — Owners
- [ ] Member lists owners → only own; never unassigned, never another member's (invariant)
- [ ] Member GET/PATCH/notes/timeline on another member's owner → 404 (invariant + contract)
- [ ] Member GET on an unassigned owner → 404 (invariant: unassigned visible to admin only)
- [ ] Phone search by a member can't reveal owners not theirs (invariant: no phone leak)
- [ ] Calling list excludes LISTED and DO_NOT_CALL owners (invariant)
- [ ] Calling list order: overdue reminder → due today → NEW → CALL_BACK → CONTACTED → INTERESTED → NOT_INTERESTED, oldest last call first (business: calling-list order)
- [ ] "Today" boundaries in Africa/Cairo: a reminder at 23:30 Cairo is "today", not tomorrow (contract: Cairo dates)
- [ ] Create owner with a phone already on another owner (any slot) → 409 PHONE_EXISTS with ownerId (invariant)
- [ ] Create owner with a phone that is a listing's owner phone → 409 PHONE_EXISTS with listingId (flow: import duplicates rule)
- [ ] Same phone typed two ways (`01001234567`, `+20 100 123 4567`) → treated as one (decision: normalisation)
- [ ] 4 phones, 0 phones, an invalid phone → 400 (contract: 1–3 phones)
- [ ] Assign to an inactive member → 400 INVALID_ASSIGNEE (flow: assign to an active member)
- [ ] Reassign moves open reminders and the owner's listing to the new member; done reminders and calls keep their member (flow: reassign)
- [ ] Assign 5001 ids → 400; assign with ids that include a deleted owner → those skipped, `moved` counts the rest (contract)
- [ ] Assign to `null` → unassigned; member loses access immediately (flow)
- [ ] Every assignment writes one activity entry per batch with the count (business: activity log)
- [ ] Delete an owner with a listing → 409 OWNER_LISTED (business)
- [ ] Member without `owners.import` deletes an owner → 403 (role)
- [ ] `doNotCall: true` sets status DO_NOT_CALL; member can set it on own owner (business: Do not call flag)
- [ ] Note body empty or > 2000 → 400 (contract)
- [ ] Assign with `assigneeId: null` → owner's open reminders become unassigned; next assignment moves them to the new member (business: reminders follow)
- [ ] Reassigning an owner moves its listing; reassigning a listing moves its owner (business: owner and listing stay together)
- [ ] Admin lists unassigned open reminders (`GET /reminders?unassigned=true`) (business: visible to the admin)
- [ ] `POST /owners` with `assignedTo` by a user without `owners.assign` → 403; `assignedTo` inactive → 400 INVALID_ASSIGNEE (role: only assigners assign)
- [ ] Member PATCHes own owner's phone to another owner's phone → 409 PHONE_EXISTS with no ids (invariant: no data about owners not theirs)
- [ ] Same phone twice in one owner's phones → 400 (checklist: duplicates)
- [ ] Create owner with a phone that belongs to a trashed owner → 409 PHONE_IN_TRASH (admin) (decision: trashed owners keep their phone)
- [ ] LISTED or DO_NOT_CALL owner with an overdue reminder is still not in the calling list (invariant)
- [ ] Never-called owners sort before called ones within a status; ties broken by created date (business: calling-list order)
- [ ] Member passes `assignedTo=unassigned`, `assignedTo=<other>`, `importId` → still only own owners (invariant)
- [ ] Member calls `/owners/assign` or `/owners/ids` → 403 (role)
- [ ] Delete owner writes an activity entry; its open reminders close; its calls stay (business: activity log; calls never deleted)
- [ ] Member sets Do not call on own owner; member clearing Do not call → 403, admin can clear it to Contacted (business: Do not call flag)
- [ ] `PATCH`/`DELETE` on a note → 404/405, no edit path exists (business: notes are added, not edited)

### T7 — Calls, outcomes, reminders, today
- [ ] Member starts a call on another member's owner → 404 (invariant)
- [ ] Start a call on a DO_NOT_CALL owner → 409; on a LISTED owner → 409 (invariant)
- [ ] Start a call with a phone not belonging to the owner → 400 (checklist: wrong value)
- [ ] Call with no outcome appears in `/me/today.outcomeMissing` until set (business: outcome missing)
- [ ] Set outcome → owner status becomes the outcome's mapped status (business: outcome sets status)
- [ ] Set outcome twice → 409 OUTCOME_ALREADY_SET; call unchanged (business: exactly one outcome)
- [ ] Another member sets the outcome on my call → 404 (role)
- [ ] Hidden outcome → 400 OUTCOME_HIDDEN (business: hidden outcomes)
- [ ] Outcome with reminder in the past → 400, and neither the outcome nor the reminder saved (checklist: half-applied)
- [ ] Outcome on a call whose owner became LISTED meanwhile → outcome saved, status stays LISTED (invariant: Listed only through a listing)
- [ ] Outcome creating `setsStatus: LISTED` → 400 (business)
- [ ] Delete an outcome in use → 409 OUTCOME_IN_USE; rename/hide in use → OK (business)
- [ ] Calls have no update/delete endpoints (invariant)
- [ ] Overdue reminders listed first in today and reminders list (business: overdue on top)
- [ ] Mark an AD_TAKE_DOWN or AD_CHECK_IN reminder done manually → 400 SYSTEM_REMINDER (business: take-down closes only on Taken down)
- [ ] Reminder on someone else's owner → 404 (invariant)
- [ ] Reminder with both ownerId and listingId, or neither → 400 (contract)
- [ ] Member can't read another member's reminders with `memberId` without `analytics.view` → 403 (role)
- [ ] Double tap: two `POST /owners/:id/calls` with the same `clientRequestId` → one call (contract: idempotent call start)
- [ ] Outcome set on an older call after a newer call already has one → owner status keeps the newer call's status (business: latest call sets status)
- [ ] Call stores the owner's name at creation (business: calls survive owner purge)
- [ ] `GET /calls` as member with another member's `memberId` or `ownerId` → only own calls returned (invariant)
- [ ] Member POST/PATCH/DELETE on `/call-outcomes` or `includeHidden=true` → 403 (role)
- [ ] `PATCH /call-outcomes/:id` with `setsStatus: LISTED` → 400 (business)
- [ ] PATCH or done on another member's reminder → 404 (invariant)
- [ ] PATCH a done reminder → 409 REMINDER_DONE (contract)
- [ ] PATCH `dueAt` of an AD_TAKE_DOWN reminder → 400 SYSTEM_REMINDER (business)
- [ ] Reminder on a listing not assigned to me → 404 (invariant)
- [ ] Call on an unassigned owner → 404 (invariant)
- [ ] Creating, renaming, hiding or reordering a call outcome writes an activity entry (business: activity log)

### T8 — Listings
- [ ] Member searches listings → sees all Available listings, `ownerPhone` null + hidden for listings not assigned to them (invariant: phone hidden)
- [ ] Assigned member and admin see the phone (business rule)
- [ ] Phone never present in list rows for anyone (contract: ListingRow has no phone)
- [ ] Default search returns only AVAILABLE (business)
- [ ] Filters: priceMin > priceMax → 400; bedroomsMin 0 OK; floor negative (basement) allowed (checklist: bounds)
- [ ] Create from own INTERESTED owner → prefilled contact, owner becomes LISTED, leaves calling list (flow 4)
- [ ] Create from another member's owner → 404 (invariant)
- [ ] Create from an owner already listed → 409 OWNER_ALREADY_LISTED (business: one listing links one owner)
- [ ] Direct create without `listings.create` → 403 (role)
- [ ] Direct create whose phone matches an owner lead → linked and lead becomes LISTED (flow 5)
- [ ] Direct create whose phone is already another listing's owner phone → 409 PHONE_IN_LISTING (decision: duplicate detection)
- [ ] Price as a fraction or negative, size 0 → 400 (money: whole EGP)
- [ ] Member edits a listing not assigned to them → 403 (role)
- [ ] Ad → LIVE without link → 400 AD_LINK_REQUIRED; on a non-AVAILABLE listing → 400 (business: Live only when Available)
- [ ] Ad → LIVE creates one AD_CHECK_IN due now + interval days (business: weekly check-in)
- [ ] Check-in with stillAvailable → closes the open check-in, records date, schedules next with the current interval (flow 7)
- [ ] Check-in with stillAvailable=false → listing OFF_MARKET + AD_TAKE_DOWN task (business: check-in outcome)
- [ ] Check-in when ad not LIVE → 400 (contract)
- [ ] Status → SOLD/RENTED/OFF_MARKET while LIVE → AD_TAKE_DOWN task created once (not twice on a second status change) (business + checklist: duplicates)
- [ ] Status change when ad NOT_POSTED → no take-down task (business)
- [ ] Ad → TAKEN_DOWN closes the take-down task and any open check-in (business)
- [ ] Reassign listing moves open reminders (flow: reassign)
- [ ] Delete listing → to trash; linked owner back to INTERESTED (business)
- [ ] Member deletes a listing → 403 (role)
- [ ] Photo registration with a URL not on our Blob store → 400 (checklist: input trust)
- [ ] 31st photo → 409 TOO_MANY_PHOTOS (contract)
- [ ] Reorder with a missing or foreign photo id → 400 (contract)
- [ ] Upload token for a listing the member isn't assigned → 403 (role)
- [ ] `q` search by phone digits never matches owner phones of listings not assigned to the caller (invariant: phone hidden)
- [ ] After a listing is reassigned, the old member no longer sees the phone and the new one does (invariant)
- [ ] `/listings/assign` without `owners.assign` → 403; inactive assignee → 400; 501 ids → 400 (role + contract)
- [ ] `POST /listings` with `assignedTo` by a user without `owners.assign` → 403; `PATCH /listings/:id` doesn't accept `assignedTo` (role: only assigners assign)
- [ ] Delete listing or photo writes an activity entry (business: activity log)
- [ ] Delete listing closes its open check-in and take-down reminders (business)
- [ ] Photo delete by a non-assigned member → 403 (role)
- [ ] sizeMin > sizeMax, floorMin > floorMax → 400 (checklist: bounds)
- [ ] Deleted listings never appear in search (contract: soft delete)
- [ ] Listing leaving AVAILABLE closes its open check-in (business: no check-ins after sale)
- [ ] Status OFF_MARKET with ad NOT_POSTED or TAKEN_DOWN → no task (business)
- [ ] Price 1,000,000,001 → 400 (money)
- [ ] Direct create with a phone of a trashed owner → 409 PHONE_IN_TRASH (decision)
- [ ] `/listings/assign` writes one activity entry per batch (business: activity log)
- [ ] Price 0 → 400; price 1 and 1,000,000,000 accepted (money: 1 – 1,000,000,000)

### T9 — Imports
- [ ] Member without `owners.import` uploads owners → 403; without `listings.create` uploads listings → 403 (role)
- [ ] Wrong file type, > 4 MB, > 20 000 rows, empty sheet → the matching 400 (contract)
- [ ] Mapping without phone or name → 400 MAPPING_INCOMPLETE (contract)
- [ ] Row whose phone exists as an owner → DUPLICATE with ownerId (flow 1)
- [ ] Row whose phone is a listing's owner phone → DUPLICATE with listingId (flow 1)
- [ ] Two rows in the same file with one phone → second is DUPLICATE (contract: within-file)
- [ ] Row with no valid phone → INVALID_PHONE, rejected (flow 1)
- [ ] Arabic names and Arabic-Indic digits in phones (٠١٠…) are read correctly (checklist: non-Latin)
- [ ] Phone in Excel stored as a number (leading zero lost: 1001234567) → normalised to +201001234567 (stack: phone never through Number)
- [ ] Owner added between preview and confirm → that row becomes DUPLICATE at confirm (contract: confirm re-checks)
- [ ] Failure midway through confirm → nothing saved, job FAILED (flow 1: all or nothing)
- [ ] Confirm twice → 409 IMPORT_ALREADY_DONE (checklist: wrong state)
- [ ] Another admin's import confirm by a member → 404 (role)
- [ ] `assignTo` an inactive member → 400 (flow: assign to an active member)
- [ ] Import writes one activity entry with the counts (business: activity log)
- [ ] Listings import with a phone matching an owner lead → linked and lead LISTED (flow 5)
- [ ] Listings import row whose phone is another listing's owner phone → DUPLICATE with listingId (decision: duplicate detection)
- [ ] Row missing a required field → MISSING_REQUIRED; bad enum/number → INVALID_VALUE (contract)
- [ ] added + duplicates + rejected = total (contract: report)
- [ ] Row whose phone belongs to a trashed owner → DUPLICATE with reason in trash (decision)
- [ ] Preview with `assignTo` by an importer without `owners.assign` → 403 (invariant: only assigners assign)

### T10 — Admin ops
- [ ] Deactivate with handOverTo member → their owners, listings and open reminders move in one transaction; calls and done reminders stay theirs (flow 8)
- [ ] Deactivate with handOverTo null → owners, listings and their open reminders become unassigned; the reminders follow the owner/listing on its next assignment (flow 8; decision logged)
- [ ] handOverTo an inactive user or the same user → 400 INVALID_HANDOVER (contract)
- [ ] Deactivate the last active admin → 409 LAST_ADMIN; deactivate self → 400 (invariant)
- [ ] Deactivated user's sessions revoked (invariant: can't sign in)
- [ ] Reactivate → can sign in again, gets nothing back automatically (decision)
- [ ] Restore an owner → it returns with its phones (never released) and its listing link (decision: trashed owners keep their phone)
- [ ] Restore a photo whose listing is deleted → 409 PARENT_DELETED (restore the listing first) (decision logged)
- [ ] Trash lists only items deleted < 30 days ago (business)
- [ ] Member calls `/trash`, `/activity`, `PATCH /settings` → 403 (role)
- [ ] Settings interval 0 or 91 → 400 (contract)
- [ ] Interval change applies to the next scheduled check-in, not already-open ones (contract)
- [ ] Every restore, deactivation, settings change writes an activity entry (business)
- [ ] Restore a listing whose owner lead has another listing now → 409 OWNER_ALREADY_LISTED; otherwise restore re-flags the owner LISTED (business: restore)
- [ ] Restore a photo when the listing already has 30 → 409 TOO_MANY_PHOTOS (contract)
- [ ] Deactivation failing midway → nothing moved, user still active (checklist: half-applied)
- [ ] Two admins deactivate each other concurrently → one admin remains active (invariant)
- [ ] Item deleted exactly 30 days ago is still restorable; 30 days + 1 minute is not (business: 30 days)
- [ ] Member calls restore → 403 (role)
- [ ] Restore an item that isn't in the trash → 404 (checklist: wrong state)

### T10b — Assign vs deactivate race
- Also extract the ASSIGN activity entry text (now written in owners, listings and imports) into the assignment domain — one helper, three callers.
- [ ] Listings import with `assignTo` writes one ASSIGN activity entry for the listings it assigned, even when no owner lead was linked (business: "one assignment entry when it assigned anything"; T9 review CONFLICT)
- [ ] Assigning owners to a member while that member is being deactivated → the assign is refused (400 INVALID_ASSIGNEE) or the owners end up with the hand-over recipient; never on the inactive member (invariant: assign only to active members)

### T11 — Analytics, exports, crons
- [ ] Member calls analytics → 403 (role)
- [ ] Default range is today in Cairo (business: default today)
- [ ] `from` after `to`, range > 366 days → 400 (contract)
- [ ] Calls counted by start time in range; outcomes breakdown sums to calls with an outcome (business: analytics)
- [ ] Reminders overdue = open and due before the range end (business)
- [ ] Deactivated member still appears for a range in which they worked (business: history stays)
- [ ] Export as member → 403 (role); export respects filters; > 50 000 rows → 400 (contract)
- [ ] Export file phone column as text (leading `+` kept) (checklist: phone format)
- [ ] Export writes an activity entry (business: activity log)
- [ ] Purge cron without the secret → 401 (contract)
- [ ] Purge removes only records deleted > 30 days ago, deletes their Blob files, keeps calls (invariant: calls never deleted; owners with calls → calls kept with owner name snapshot)
- [ ] Ad safety-net cron: LIVE ad with no open check-in gets one; LIVE ad with one gets none extra (contract)
- [ ] Purge cron also deletes refresh tokens expired > 30 days and login attempts older than 1 day (T4 follow-up)
- [ ] Ad safety-net cron skips listings that aren't AVAILABLE or are deleted (business: check-ins only while for sale)
- [ ] Stats: assignedOwners and adsLive counted at the range end; adsTakenDown, interestedOwners, listingsCreated, remindersDone counted inside the range (contract: Stats)
- [ ] Team totals equal the sum of members (contract)
- [ ] Reminders closed because their owner/listing was deleted are not counted as "done" (T6 closes them by setting doneAt — add a close reason or exclude them)
- [ ] remindersOverdue = reminders still open at the range end whose due time is before it (contract: Stats, decided in review)

### T12 — Web shell (auth routing)
- [ ] Signed out on a protected page → login with return path (frontend rule)
- [ ] Signed in on `/login` → `homeFor(role)` (frontend rule)
- [ ] Expired access + valid refresh → refreshed in place in middleware, no redirect (frontend rule)
- [ ] Three parallel requests refreshing with the same token → none signed out (frontend rule)
- [ ] Failed refresh → login, cookies cleared (frontend rule)
- [ ] A member opening an admin page → their home (role)

### T19 — Backups
- [ ] Backup job produces a dump that restores into an empty database with the same row counts (data protection: nightly copy)
- [ ] R2 lifecycle rule deletes objects older than 30 days, checked by reading the bucket config (data protection: 30 copies)

## Interaction cases — `ui` tasks

- **T12** — login: wrong password message, double submit sends one request, signed-in user on `/login` → home, signed-out on a page → login with return path, concurrent refresh doesn't sign out, Arabic RTL renders, theme/language persist across reload with no flash.
- **T13** — call button opens `tel:` and creates the call once; returning shows the outcome sheet; outcome required; reminder date in the past blocked; empty Today state; Outcome missing item opens the sheet; long Arabic name doesn't break the row.
- **T14** — search filters persist in the URL without scrolling; min > max blocked; phone hidden label for non-assigned; photo upload shows progress, rejects wrong type / > 10 MB, HEIC converted; reorder; ad Live requires a link; check-in "no longer available" confirms.
- **T15** — import wizard: unsupported file message, mapping requires name + phone, preview lists duplicates/rejected, confirm disabled while pending, report shows counts; owners table select-all across pages and "next N unassigned"; assign dialog lists active members only, empty state.
- **T16** — create user validation (email, phone 11 digits `01`), deactivate requires a hand-over choice, last admin action disabled with reason, roles editor can't untick Admin, outcome delete in use → offer hide, restore conflict message.
- **T17** — date range presets, empty range state, export button busy state.

## Verify and ship

- Full suite, lint, typecheck green; each case above ticked against its named test.
- Smoke specs per role (admin, member) on the main flows, light/dark, EN/AR.
- `ui-auditor` over every screen; `break-ui` on lists and detail screens.
- Ship: PRs into `dev` → preview deploy (needs Vercel access) → release PR → production.
