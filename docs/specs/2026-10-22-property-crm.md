# Prime Property CRM — Spec

Date: 2026-10-22 · Status: approved (autonomous run, see `docs/build-log/decisions/foundation.md`)

## Goal

Replace Prime's paper-based process for finding homeowners, calling them, listing their homes and
following up on Property Finder ads with a small, mobile-first CRM. The admin sees all the data and
the whole team. Each team member works only their assigned owners and calls them from their phone.

## Platforms and stack

- **Web only**, fully responsive and mobile-first. Installable to the home screen (PWA). No native
  store apps.
- **Languages:** English and Arabic, with full RTL layout for Arabic. Each user picks a language.
- **Single tenant:** one company (Prime). No multi-tenancy.
- **Backend:** a NestJS API built in this project (`apps/api`), Prisma, Postgres on Neon (set up
  through the Vercel marketplace integration).
- **Frontend:** Next.js (`apps/web`), Tailwind, shadcn/ui.
- **Shared:** `packages/shared` holds the zod schemas, API types, locale files and pure logic
  (phone normalisation, status rules).
- **Files:** listing photos in Vercel Blob.
- **Backups:** a nightly GitHub Actions job runs `pg_dump` and uploads it to Cloudflare R2 (free
  tier). An R2 lifecycle rule deletes copies older than 30 days. Photos are not backed up; they are
  protected by delayed deletion instead (see Data protection).
- **Hosting:** Vercel (web and API). Running cost about 45 USD a month, paid by the client.

## Users and roles

| Role | Can do |
|---|---|
| **Admin** | Everything: manage users and roles, import owners, assign and reassign, see every owner, listing, phone number and call, see analytics, export data, restore deleted records |
| **Team member** (default role) | See and call only their assigned owners, log call outcomes, notes and reminders, create listings from their owners, search all listings (owner phone hidden unless the listing is theirs) |

Roles are permission sets. The admin can create extra roles (for example "Team lead") by ticking
permissions from a fixed list. The two built-in roles cannot be deleted.

Accounts are created by the admin. There is no self sign-up. Sign-in is email and password; the
admin can reset a member's password.

## Entities

- **User** — name, email, phone, role, language, active or deactivated.
- **Role** — name and a set of permissions.
- **Owner** (homeowner lead) — name, phone(s), area, notes, source (which import), assigned member,
  lead status, flags (listed, do not call).
- **Import** — an uploaded Excel or CSV file (Google Sheets are exported to one of these), its column
  mapping, and its result: rows added, duplicates skipped, rows with errors.
- **Call** — owner, member, time, outcome, note. Created when the member taps Call.
- **Call outcome** — admin-editable list, each mapped to the lead status it sets. Defaults: No answer,
  Busy, Switched off, Wrong number, Interested to sell, Interested to rent, Not interested, Call back
  later, Already sold or rented, Do not call again.
- **Reminder** — owner or listing, member, due date and time, note, done or open.
- **Note** — free text on an owner or a listing, with author and time.
- **Listing** — purpose (sale or rent), property type, area / compound, address, size (sqm), floor,
  bedrooms, bathrooms, price (EGP), furnishing, description, photos, owner contact, assigned member,
  status (Available, Sold, Rented, Off market), Property Finder ad (link, ad status, posted date, last
  check-in date).
- **Activity log entry** — who did what and when, for imports, assignments, deletions, restores, role
  and user changes.

## Flows

1. **Import owners.** Admin uploads an Excel or CSV file, maps its columns to owner fields, sees a
   preview with duplicates and invalid phones marked, then confirms. Duplicates (same normalised
   phone as an existing owner or listing owner) are skipped and listed in the import report.
2. **Assign.** Admin selects owners (filters, select all, or a count such as "next 200 unassigned")
   and assigns them to a member. Reassigning moves the owner with its full history.
3. **Call.** Member opens their list (due reminders first, then new owners), taps Call, the phone
   dials. On return, an outcome sheet opens; the member picks an outcome, adds a note and optionally a
   reminder. A call left without an outcome shows in the member's to-do as "Outcome missing".
4. **Owner interested → listing.** From an interested owner the member creates a listing, prefilled
   with the owner's contact. The owner is flagged **Listed** and leaves the calling list.
5. **Listings added directly.** Admin (or a member with permission) adds listings manually or by bulk
   upload. If the owner's phone matches an existing owner lead, the two are linked and the lead is
   flagged **Listed**.
6. **Client request search.** Any member searches available listings by purpose, type, area, price
   range, size range, bedrooms, bathrooms and floor. Owner phone numbers are hidden on listings not
   assigned to them.
7. **Property Finder follow-up.** The member saves the ad link and marks the ad Live. The system
   creates a check-in reminder every 7 days (admin can change the interval) to ask the owner whether
   the home is still available. When a listing is marked Sold, Rented or Off market while its ad is
   Live, a "Take down the ad" task is created for the assigned member until the ad is marked Taken
   down.
8. **Analytics.** Admin sees, per member and for any date range (default today): calls made, outcomes
   breakdown, reminders done and overdue, assigned owners, interested owners, listings created, ads
   live and taken down. Plus team totals.
9. **Deactivate a member.** Admin picks who receives the member's owners, listings and open reminders
   (another member, or unassigned). The member can no longer sign in; their history stays.
10. **Delete and restore.** Deleting an owner, listing or photo hides it. Admin can restore it for
    30 days; after that it is removed for good, photos included.
11. **Export.** Admin downloads owners or listings (current filters) as Excel.

## Data protection

- Nightly full database copy to separate storage, 30 copies kept.
- Neon restore-to-a-point window as the Neon plan allows (7 days on the paid Launch plan).
- Delayed deletion: 30 days for records and photos.
- Activity log for imports, assignments, deletions, restores, user and role changes.
- HTTPS everywhere; permissions enforced by the API, never only hidden in the UI.

## Defaults chosen at intake

See `docs/build-log/decisions/foundation.md` for each decision with its reason and alternatives.

- Phone numbers are normalised to international format with Egypt (+20) as the default country.
- Prices are whole EGP amounts.
- Google Sheets are supported by uploading an exported Excel or CSV file, not by a live connection.
- Reminders show in the app (badge and due list). Push notifications are Planned.

## Out of scope (version 1)

- Automatic posting to Property Finder through its API (Planned, phase 2).
- Call recording, in-app VoIP calling, WhatsApp integration.
- Native iOS / Android store apps.
- A buyer / tenant client database (Planned).
- Push and email notifications (Planned).
- Live two-way Google Sheets sync.

## API contract

The seam between `apps/api` and `apps/web`. Request and response shapes live as zod schemas in
`packages/shared/src/contract/` (one file per domain below); the API's DTOs mirror them with
`class-validator`, and a shared test checks the two agree. Base path `/api`.

### Conventions

- **Envelope.** Every JSON response is `{ success, message, statusCode, data, meta?, error?,
  timestamp, path }`. Errors carry `error` as a stable code (`NOT_FOUND`, `FORBIDDEN`,
  `CONFLICT`, `VALIDATION_FAILED`, plus the domain codes listed per endpoint) and `message` as an
  English sentence; the web maps the code to a translated string.
- **Exceptions to the envelope:** Excel exports (an `.xlsx` file) and the Vercel Blob upload
  handshake, which speaks the Blob client protocol.
- **Lists** are paginated: `?page=1&limit=20`, `limit` max 20 (100 for endpoints marked *picker*),
  `meta = { total, page, limit, hasNextPage, hasPreviousPage }`.
- **Auth.** `Authorization: Bearer <accessToken>` on every endpoint except those marked *public*.
  Access token: JWT, 15 minutes, carries `sub`, `roleId`, `permissions[]`, `sid` (session id).
  Refresh token: opaque, 30 days, rotated on every use, stored hashed, one family per sign-in; a
  rotated token reused within 30 s returns a new pair in the same family, after 30 s it revokes the
  family; revoked on sign-out, password reset and
  deactivation. Every request re-checks that the user is active.
- **Permissions** are checked by the API on every endpoint. "Own" means assigned to the caller.
- **Ids** are UUIDs. **Times** are ISO 8601 UTC; "today" and date ranges are computed in
  `Africa/Cairo`. **Phones** go in as typed and come out normalised E.164 (`+201001234567`).
- **Money:** `price` is a whole-EGP integer.
- **Soft delete.** Deleted records answer `404` everywhere except `/trash`.
- **Not yours = `404`.** An owner, call or reminder that belongs to someone else answers `404`, never
  `403`, so ids can't be probed.

### Permissions (fixed list)

| Key | Grants | Admin | Team member |
|---|---|---|---|
| `users.manage` | users: create, edit, reset password, deactivate | ✓ | |
| `roles.manage` | roles: create, edit, delete | ✓ | |
| `owners.viewAll` | every owner, assigned or not, with phones | ✓ | |
| `owners.import` | import owners, add or delete an owner | ✓ | |
| `owners.assign` | assign and reassign owners and listings | ✓ | |
| `listings.create` | add a listing directly (not from an own owner), bulk-import listings | ✓ | |
| `listings.manageAll` | edit or delete any listing, see every owner phone on listings | ✓ | |
| `analytics.view` | analytics, every member's calls and reminders | ✓ | |
| `activity.view` | the activity log | ✓ | |
| `data.export` | Excel exports | ✓ | |
| `trash.restore` | see deleted records and restore them | ✓ | |
| `settings.manage` | call outcomes, ad check-in interval | ✓ | |

With no permission at all a user can: work own owners, log calls, notes and reminders, create a
listing from an own owner, edit own listings and their ads, search all listings. The Admin role
holds every key and cannot lose one; at least one active user always holds the Admin role.

### Enums

- `LeadStatus`: `NEW` `CONTACTED` `INTERESTED` `NOT_INTERESTED` `CALL_BACK` `LISTED` `DO_NOT_CALL`
- `ListingPurpose`: `SALE` `RENT`
- `ListingStatus`: `AVAILABLE` `SOLD` `RENTED` `OFF_MARKET`
- `PropertyType`: `APARTMENT` `DUPLEX` `PENTHOUSE` `STUDIO` `VILLA` `TOWNHOUSE` `TWIN_HOUSE`
  `CHALET` `OFFICE` `SHOP` `LAND`
- `Furnishing`: `UNFURNISHED` `SEMI_FURNISHED` `FURNISHED`
- `AdStatus`: `NOT_POSTED` `LIVE` `TAKEN_DOWN`
- `ReminderKind`: `MANUAL` `AD_CHECK_IN` `AD_TAKE_DOWN`
- `Language`: `en` `ar`
- `ActivityType`: `IMPORT` `ASSIGN` `DELETE` `RESTORE` `USER_CREATE` `USER_UPDATE`
  `USER_DEACTIVATE` `USER_REACTIVATE` `PASSWORD_RESET` `ROLE_CREATE` `ROLE_UPDATE` `ROLE_DELETE`
  `SETTINGS_UPDATE` `OUTCOME_UPDATE` `EXPORT`

### Default call outcomes

| Outcome | Sets lead status |
|---|---|
| No answer · Busy · Switched off | `CONTACTED` |
| Interested to sell · Interested to rent | `INTERESTED` |
| Not interested · Already sold or rented | `NOT_INTERESTED` |
| Call back later | `CALL_BACK` |
| Wrong number · Do not call again | `DO_NOT_CALL` |

No outcome may set `LISTED`; only a listing does.

### Shapes

```ts
UserSummary   { id, name }
User          { id, name, email, phone|null, language, active, role: { id, name }, createdAt }
Me            User & { permissions: string[] }
Role          { id, name, builtIn, permissions: string[], userCount }
OwnerRow      { id, name, phones: string[], area|null, status: LeadStatus,
                assignedTo: UserSummary|null, lastCall: { at, outcome: { id, label } }|null,
                nextReminderAt|null, createdAt }
Owner         OwnerRow & { notes: Note[] (latest 3), listingId|null,
                source: { importId, fileName }|null }
Call          { id, owner: { id|null, name }, member: UserSummary, phone, startedAt,
                outcome: { id, label, setsStatus: LeadStatus }|null, note|null, outcomeAt|null }
CallOutcome   { id, labelEn, labelAr, setsStatus: LeadStatus, hidden, order, inUse }
Reminder      { id, kind: ReminderKind, dueAt, note|null, doneAt|null, overdue,
                owner: { id, name }|null, listing: { id, title }|null, member: UserSummary|null }
Note          { id, body, author: UserSummary, createdAt }
Photo         { id, url, order }
ListingRow    { id, title, purpose, type, area, compound|null, price, sizeSqm, bedrooms|null,
                bathrooms|null, floor|null, status, coverPhotoUrl|null, adStatus,
                assignedTo: UserSummary|null, checkInDue: boolean }
Listing       ListingRow & { address|null, furnishing|null, description|null, photos: Photo[],
                ownerName, ownerPhone: string|null, ownerPhoneHidden: boolean, ownerId|null,
                ad: { link|null, status: AdStatus, postedAt|null, lastCheckInAt|null,
                      nextCheckInAt|null }, adTakeDownOpen: boolean, notes: Note[] (latest 3),
                createdAt, updatedAt }
ImportJob     { id, kind: 'OWNERS'|'LISTINGS', fileName,
                status: 'MAPPING'|'PREVIEWED'|'DONE'|'FAILED', headers: string[],
                mapping: Record<field, header>|null,
                counts: { total, added, duplicates, rejected }|null,
                createdBy: UserSummary, createdAt }
ImportIssue   { row, reason: 'DUPLICATE'|'INVALID_PHONE'|'MISSING_REQUIRED'|'INVALID_VALUE',
                field|null, value|null, matches: { ownerId|null, listingId|null }|null }
ActivityEntry { id, type: ActivityType, actor: UserSummary, summary,
                target: { kind, id, label }|null, details: object|null, createdAt }
TrashItem     { kind: 'OWNER'|'LISTING'|'PHOTO', id, label, deletedBy: UserSummary,
                deletedAt, purgeAt }
Stats         { calls, outcomes: { outcomeId, label, count }[], remindersDone,
                remindersOverdue, assignedOwners, interestedOwners, listingsCreated,
                adsLive, adsTakenDown }
```

- A listing's `title` is derived, never typed: type · bedrooms · area, in the reader's language
  (the caller's stored `language`) — in listing rows and detail, reminders, today's ad tasks and
  trash labels. The activity log keeps the English label as a snapshot.
- `adTakeDownOpen` is true exactly while the listing has an open `AD_TAKE_DOWN` task.
- `ownerPhone` is `null` with `ownerPhoneHidden: true` unless the listing is assigned to the caller
  or the caller holds `listings.manageAll`.
- In `Stats`, "the end of the range" is the earlier of the range end and now. `assignedOwners` and `adsLive` are counts at the end of the range; the rest count
  events inside it. `remindersOverdue` = reminders still open at the end of the range whose due time
  is before it. Team totals are the sum of the members.
- `member: null` on a reminder means unassigned: it belongs to an unassigned owner or listing and
  follows it to the next member it is assigned to.
- A trashed owner keeps its phones until it is purged, so a new owner or listing can't take them
  (`409 PHONE_IN_TRASH` for callers with `trash.restore`, plain `409 PHONE_EXISTS` otherwise).
- `409 PHONE_EXISTS` carries `{ ownerId | listingId }` only for callers with `owners.viewAll`.

### Auth — `/auth`

| Endpoint | Who | Body | Returns | Errors |
|---|---|---|---|---|
| `POST /auth/login` | *public* | `{ email, password }` | `{ accessToken, refreshToken, user: Me }` | `401 INVALID_CREDENTIALS` (same for unknown email, wrong password, deactivated) · `429` after 10 failures in 15 min per email |
| `POST /auth/refresh` | *public* | `{ refreshToken }` | `{ accessToken, refreshToken }` | `401 INVALID_REFRESH` |
| `POST /auth/logout` | any | `{ refreshToken }` | `null` | — |
| `GET /auth/me` | any | — | `Me` | — |
| `PATCH /auth/me` | any | `{ name?, phone?, language? }` | `Me` | — |
| `POST /auth/me/password` | any | `{ currentPassword, newPassword }` (min 8) | `null`; revokes other sessions | `400 WRONG_PASSWORD` |

### Users — `/users`

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `GET /users` | `users.manage` | `q, roleId, active, page, limit` | `User[]` | — |
| `GET /users/options` | `owners.assign` or `users.manage`, *picker* | `active` | `UserSummary[]` | — |
| `POST /users` | `users.manage` | `{ name, email, phone?, roleId, language, password }` | `User` | `409 EMAIL_TAKEN` · `400 INVALID_ROLE` |
| `GET /users/:id` | `users.manage` | — | `User & { counts: { owners, listings, openReminders } }` | `404` |
| `PATCH /users/:id` | `users.manage` | `{ name?, email?, phone?, roleId?, language? }` | `User` | `409 EMAIL_TAKEN` · `409 LAST_ADMIN` · `400 INVALID_ROLE` |
| `POST /users/:id/reset-password` | `users.manage` | `{ newPassword }` | `null`; revokes their sessions | — |
| `POST /users/:id/deactivate` | `users.manage` | `{ handOverTo: userId \| null }` (`null` = unassigned) | `User`; owners, listings and open reminders move in one transaction | `409 LAST_ADMIN` · `400 SELF_DEACTIVATE` · `400 INVALID_HANDOVER` |
| `POST /users/:id/reactivate` | `users.manage` | — | `User` | — |

### Roles — `/roles`

| Endpoint | Who | Body | Returns | Errors |
|---|---|---|---|---|
| `GET /roles/permissions` | `roles.manage` | — | `{ key, labelEn, labelAr }[]` | — |
| `GET /roles` | `roles.manage` or `users.manage`, *picker* | — | `Role[]` | — |
| `POST /roles` | `roles.manage` | `{ name, permissions[] }` | `Role` | `409 ROLE_NAME_TAKEN` · `400` unknown key |
| `PATCH /roles/:id` | `roles.manage` | `{ name?, permissions? }` | `Role` | `400 BUILT_IN_ROLE` (Admin's permissions) |
| `DELETE /roles/:id` | `roles.manage` | — | `null` | `400 BUILT_IN_ROLE` · `409 ROLE_IN_USE` |

A permission change reaches the user with their next access token (within 15 minutes);
deactivation and password reset take effect on the next request.

### Owners — `/owners`

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `GET /owners` | any (own only without `owners.viewAll`) | `q` (name or phone), `status[]`, `assignedTo` (`me` \| `unassigned` \| userId), `area`, `importId`, `hasReminder`, `sort` (`created` \| `lastCall` \| `name`), `page, limit` | `OwnerRow[]` | — |
| `GET /owners/calling-list` | any (own) | `page, limit` | `OwnerRow[]`: own, not `LISTED`, not `DO_NOT_CALL`; overdue reminder first, then due today, then `NEW`, `CALL_BACK`, `CONTACTED`, `INTERESTED`, `NOT_INTERESTED`; oldest last call first within each | — |
| `GET /owners/ids` | `owners.assign` | the `GET /owners` filters + `take` (≤ 5000) | `{ ids: string[], total }` (for "select all" and "next 200 unassigned") | — |
| `POST /owners` | `owners.import` (`assignedTo` also needs `owners.assign`) | `{ name, phones[] (1–3, distinct), area?, note?, assignedTo? }` | `Owner` | `409 PHONE_EXISTS` · `409 PHONE_IN_TRASH` · `400 INVALID_ASSIGNEE` · `403` |
| `GET /owners/:id` | own or `owners.viewAll` | — | `Owner` | `404` |
| `PATCH /owners/:id` | own or `owners.viewAll` | `{ name?, phones?, area?, doNotCall? }` (`doNotCall: false` needs `owners.viewAll` and sets `CONTACTED`) | `Owner` | `409 PHONE_EXISTS` · `403` |
| `DELETE /owners/:id` | `owners.import` | — | `null` (to trash; its open reminders close; calls stay) | `409 OWNER_LISTED` (delete the listing first) |
| `POST /owners/assign` | `owners.assign` | `{ ownerIds[] (≤ 5000), assigneeId: userId \| null }` | `{ moved }`; open reminders and the owner's listing follow (unassigned with `null`) | `400 INVALID_ASSIGNEE` |
| `GET /owners/:id/timeline` | own or `owners.viewAll` | `page, limit` | items of `{ kind: 'CALL', call }`, `{ kind: 'NOTE', note }`, `{ kind: 'REMINDER', reminder }`, `{ kind: 'ASSIGN', from, to, by, at }`, newest first | `404` |
| `GET /owners/:id/notes` | own or `owners.viewAll` | `page, limit` | `Note[]` | `404` |
| `POST /owners/:id/notes` | own or `owners.viewAll` | `{ body }` (1–2000 chars) | `Note` | `404` |

### Imports — `/imports`

Owners and listings share one flow. The file is parsed on upload and its rows kept in the database
until confirmed, so nothing depends on the server's disk. Limits: `.xlsx`, `.xls` or `.csv`, 4 MB,
20 000 rows, first sheet only.

| Endpoint | Who | Body | Returns | Errors |
|---|---|---|---|---|
| `POST /imports` | `owners.import` (owners) · `listings.create` (listings) | multipart `file`, `kind` | `ImportJob` with `headers` and a suggested `mapping` | `400 FILE_TYPE` · `400 FILE_TOO_LARGE` · `400 TOO_MANY_ROWS` · `400 EMPTY_FILE` |
| `POST /imports/:id/preview` | its creator | `{ mapping, assignTo?: userId }` (`assignTo` needs `owners.assign`) | `{ job, sample: object[] (first 20 mapped rows), issues: ImportIssue[] (first 100) }` | `400 MAPPING_INCOMPLETE` (owners: name, phone; listings also purpose, type, area, price, sizeSqm) · `400 MAPPING_INVALID` (unknown field or header) · `409 IMPORT_NOT_EDITABLE` |
| `POST /imports/:id/confirm` | its creator | — | `ImportJob` with `counts`; one transaction, so a failure saves nothing and the job becomes `FAILED` | `409 IMPORT_NOT_PREVIEWED` · `409 IMPORT_ALREADY_DONE` · `500 IMPORT_FAILED` (nothing saved; a FAILED import can be previewed and confirmed again) |
| `GET /imports` | `owners.import` or `listings.create` | `kind, page, limit` | `ImportJob[]` | — |
| `GET /imports/:id/issues` | its creator or `owners.import` | `reason, page, limit` | `ImportIssue[]` | — |

Duplicates are checked against existing owners, existing listing owners **and earlier rows in the
same file**. Confirm checks again, since owners may have been added after the preview.

### Calls and outcomes

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `POST /owners/:id/calls` | own owner only | `{ phone, clientRequestId }` (phone: one of the owner's; `clientRequestId`: a UUID, a repeat returns the same call) | `Call`; the web then opens `tel:` | `404` · `409 DO_NOT_CALL` · `409 OWNER_LISTED` · `400 PHONE_NOT_OWNERS` · `409 REQUEST_ID_REUSED` (same id, different owner) |
| `POST /calls/:id/outcome` | the call's member | `{ outcomeId, note?, reminder?: { dueAt, note? } }` | `Call`; sets the lead status by the outcome's mapping unless a later call already has an outcome, and creates the reminder | `409 OUTCOME_ALREADY_SET` · `400 OUTCOME_HIDDEN` · `400 REMINDER_IN_PAST` · `404` unknown outcome |
| `GET /calls` | any (own without `analytics.view`) | `memberId, ownerId, outcomeId, from, to, missingOutcome, page, limit` | `Call[]` newest first | — |
| `GET /call-outcomes` | any, *picker* | `includeHidden` (`settings.manage`) | `CallOutcome[]` by `order` | — |
| `POST /call-outcomes` | `settings.manage` | `{ labelEn, labelAr, setsStatus }` | `CallOutcome` | `400` for `setsStatus: LISTED` |
| `PATCH /call-outcomes/:id` | `settings.manage` | `{ labelEn?, labelAr?, setsStatus?, hidden?, order? }` | `CallOutcome` | `400` for `setsStatus: LISTED` |
| `DELETE /call-outcomes/:id` | `settings.manage` | — | `null` | `409 OUTCOME_IN_USE` (hide it instead) |

Calls are never edited or deleted; the outcome is set once.

### Reminders and today

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `GET /me/today` | any | — | `{ outcomeMissing: Call[], overdue: Reminder[], dueToday: Reminder[], adTasks: Reminder[], counts: { overdue, dueToday, outcomeMissing, adTasks, callsToday, remindersOpen } }`, each list ≤ 50; `counts` are true totals (not capped) | — |
| `GET /reminders` | any (own; `memberId` needs `analytics.view`) | `state` (`open` \| `done`), `when` (`overdue` \| `today` \| `upcoming`), `kind`, `memberId`, `unassigned` (needs `owners.assign`), `ownerId` (every reminder of that owner: own or `owners.viewAll`), `listingId` (every reminder of that listing: own or `listings.manageAll`), `page, limit` | `Reminder[]` by `dueAt` | `404` owner / listing not visible, missing or in the trash |
| `POST /reminders` | own owner or listing | `{ ownerId \| listingId, dueAt, note? }` | `Reminder` (`MANUAL`) | `400 REMINDER_IN_PAST` · `400` both or neither target |
| `PATCH /reminders/:id` | its member | `{ dueAt?, note? }` | `Reminder` | `409 REMINDER_DONE` · `400 SYSTEM_REMINDER` (`AD_TAKE_DOWN` can't be moved) |
| `POST /reminders/:id/done` | its member | — | `Reminder` | `400 SYSTEM_REMINDER`: `AD_TAKE_DOWN` closes only when the ad is taken down, `AD_CHECK_IN` only through a check-in |

### Listings — `/listings`

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `GET /listings` | any | `purpose, type[], area, compound, priceMin, priceMax, sizeMin, sizeMax, bedroomsMin, bathroomsMin, floorMin, floorMax, status[]` (default `AVAILABLE`), `adStatus, assignedTo, checkInDue, q, sort` (`newest` \| `priceAsc` \| `priceDesc` \| `sizeDesc`), `page, limit` | `ListingRow[]` | `400` min > max |
| `POST /listings` | from an own owner: any · direct: `listings.create` · `assignedTo` needs `owners.assign` (default: the creator) | `{ ownerId? \| (ownerName, ownerPhone), purpose, type, area, compound?, address?, sizeSqm, floor?, bedrooms?, bathrooms?, price (1 – 1 000 000 000), furnishing?, description?, assignedTo? }` | `Listing`; the owner becomes `LISTED`; a direct listing whose phone matches an owner links to it and the owner moves to the listing's member | `409 OWNER_ALREADY_LISTED` · `409 PHONE_IN_LISTING` · `409 PHONE_IN_TRASH` · `403` |
| `GET /listings/:id` | any | — | `Listing` (owner phone per the rule above) | `404` |
| `PATCH /listings/:id` | assigned member or `listings.manageAll` | any create field except `ownerId` and `assignedTo` | `Listing` | `403` |
| `POST /listings/:id/status` | assigned or `listings.manageAll` | `{ status }` | `Listing`; leaving `AVAILABLE` closes the open check-in and, while the ad is `LIVE`, opens one `AD_TAKE_DOWN` task | — |
| `PUT /listings/:id/ad` | assigned or `listings.manageAll` | `{ link?, status, postedAt? }` | `Listing`; → `LIVE` schedules the first check-in; → `TAKEN_DOWN` closes the take-down task and any open check-in | `400 AD_LINK_REQUIRED` (for `LIVE`) · `400 LISTING_NOT_AVAILABLE` (`LIVE` on a listing that isn't `AVAILABLE`) |
| `POST /listings/:id/ad/check-in` | assigned or `listings.manageAll` | `{ stillAvailable: boolean, note? }` | `Listing`; records the check-in, closes the open check-in, schedules the next; `stillAvailable: false` sets `OFF_MARKET` and opens a take-down task | `400 AD_NOT_LIVE` |
| `POST /listings/assign` | `owners.assign` | `{ listingIds[] (≤ 500), assigneeId: userId \| null }` | `{ moved }`; open reminders and the linked owner follow | `400 INVALID_ASSIGNEE` |
| `DELETE /listings/:id` | `listings.manageAll` | — | `null` (to trash); its open reminders close; the linked owner goes back to `INTERESTED` | — |
| `GET /listings/:id/notes` | any | `page, limit` | `Note[]` | `404` |
| `POST /listings/:id/notes` | assigned or `listings.manageAll` | `{ body }` | `Note` | — |
| `GET /lookups/areas` | any, *picker* | `q` | `{ area, compounds: string[] }[]` from existing owners and listings | — |

### Photos

Uploaded straight from the browser to Vercel Blob (client upload), so files never pass through
the API's 4.5 MB body limit.

| Endpoint | Who | Body | Returns | Errors |
|---|---|---|---|---|
| `POST /uploads/listing-photo` | assigned or `listings.manageAll` | Vercel Blob `handleUpload` protocol, `clientPayload: { listingId }` | Blob token (not enveloped); `image/jpeg`, `image/png`, `image/webp`, ≤ 10 MB | `403` |
| `POST /listings/:id/photos` | same | `{ url, pathname }` | `Photo` | `400` URL not on our Blob store · `409 TOO_MANY_PHOTOS` (30) |
| `PUT /listings/:id/photos/order` | same | `{ photoIds[] }` (all of them) | `Photo[]` | `400` set mismatch |
| `DELETE /listings/:id/photos/:photoId` | same | — | `null` (to trash; the Blob file stays 30 days) | — |

The web converts HEIC to JPEG and shrinks photos to 2560 px on the long side before upload.

### Trash, activity, settings, analytics, export

| Endpoint | Who | Body / query | Returns | Errors |
|---|---|---|---|---|
| `GET /trash` | `trash.restore` | `kind, page, limit` | `TrashItem[]` | — |
| `POST /trash/:kind/:id/restore` | `trash.restore` | — | `null`; a restored listing re-flags its owner `LISTED` | `409 OWNER_ALREADY_LISTED` (its owner has another listing now) · `409 PARENT_DELETED` (photo of a deleted listing) · `409 TOO_MANY_PHOTOS` · `410 PURGED` |
| `GET /activity` | `activity.view` | `type[], actorId, from, to, page, limit` | `ActivityEntry[]` | — |
| `GET /settings` | any | — | `{ adCheckInDays }` | — |
| `PATCH /settings` | `settings.manage` | `{ adCheckInDays }` (1–90) | `{ adCheckInDays }`; applies to check-ins scheduled after the change | — |
| `GET /analytics/team` | `analytics.view` | `from, to` (default today, ≤ 366 days) | `{ range: { from, to }, totals: Stats, members: (UserSummary & { active } & Stats)[] }` | `400` bad range |
| `GET /analytics/members/:id` | `analytics.view` | `from, to` | `UserSummary & Stats & { byDay: { date, calls }[] }` | `404` |
| `GET /exports/owners` | `data.export` | the `GET /owners` filters | `.xlsx`, ≤ 50 000 rows | `400 EXPORT_TOO_LARGE` |
| `GET /exports/listings` | `data.export` | the `GET /listings` filters | `.xlsx` | `400 EXPORT_TOO_LARGE` |

### Scheduled jobs (not public)

| What | Trigger | Does |
|---|---|---|
| `POST /internal/cron/purge` | Vercel cron, daily 03:00 Cairo, `CRON_SECRET` | Removes records and photos (Blob files too) deleted more than 30 days ago |
| `POST /internal/cron/ad-check-ins` | Vercel cron, daily 06:00 Cairo, `CRON_SECRET` | Safety net: every `LIVE` ad on an `AVAILABLE`, non-deleted listing has exactly one open check-in |
| `.github/workflows/backup.yml` | GitHub Actions, nightly | `pg_dump` → Cloudflare R2 |
