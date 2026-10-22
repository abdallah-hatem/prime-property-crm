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
