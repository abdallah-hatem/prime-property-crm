# Prime Property CRM — Business Logic

Last updated: 2026-10-22 (plan) · Source spec: `docs/specs/2026-10-22-property-crm.md`

This file is what the business is and how it behaves **now**. Every behavior change updates it in the
same commit. Items not built yet are marked **Planned**. Nothing is built yet: everything below is the
agreed version 1.

## The business

Prime is a real estate company. Its team calls homeowners from lists to ask whether they want to sell
or rent their home. When an owner agrees, Prime collects the home's details and photos and advertises
it on Property Finder, then keeps in touch with the owner until the home is sold or rented and the ad
comes down. Prime also answers clients who call asking for a specific kind of home by searching its
current listings.

The system does not handle money: no payments, commissions or invoices.

## Roles

- **Admin** — full access. Manages users and roles, imports owners, assigns work, sees every owner,
  listing, phone number, call and report, exports data, restores deleted records.
- **Team member** — works only the owners assigned to them; can search all listings.
- **Custom roles** — the admin can create roles from a fixed list of permissions. Admin and Team
  member are built in and cannot be deleted.

Accounts are created by the admin only. A deactivated user cannot sign in, and their history stays.

## Entities and rules

### Owner (homeowner lead)
- Identified by a normalised phone number (international format, Egypt +20 by default). Two owners can
  never share a phone number.
- Has at most one assigned member at a time. Unassigned owners are visible to the admin only.
- Lead status: **New → Contacted → Interested / Not interested / Call back**, plus **Listed** and
  **Do not call**. The latest call outcome sets the status, through the outcome's mapping.
- **Listed** and **Do not call** owners never appear in any calling list.
- A member can mark their own owner **Do not call**; only the admin can clear it (the owner goes
  back to Contacted).
- An owner and its listing always have the same member: reassigning either moves the other.
- Calling list order: owners with an overdue reminder, then a reminder due today, then New, Call
  back, Contacted, Interested, Not interested; within each, the one called longest ago first.
- An owner with a listing can't be deleted until the listing is. Deleting a listing sends its owner
  back to **Interested**.

### Call
- Created when a member taps Call on an owner assigned to them.
- Gets exactly one outcome. Tapping Call twice by accident creates one call.
- The lead status follows the latest call that has an outcome: setting a late outcome on an older
  call never overrides a newer one. A call without an outcome stays in the member's to-do as "Outcome missing"
  until one is set.
- Calls are never deleted; they are the activity record. A call keeps the owner's name, so it
  survives the owner being removed for good after 30 days in the trash.

### Call outcome
- An admin-editable list. Each outcome maps to the lead status it sets. An outcome in use can be
  renamed or hidden, not deleted. No outcome can set **Listed** — only creating a listing does.
- Defaults: No answer, Busy, Switched off → Contacted · Interested to sell, Interested to rent →
  Interested · Not interested, Already sold or rented → Not interested · Call back later → Call back ·
  Wrong number, Do not call again → Do not call.

### Reminder
- Belongs to one owner or listing and that record's member (or to nobody while it is unassigned),
  with a due date and time.
- Deleting an owner or listing closes its open reminders.
- Overdue reminders stay at the top of the member's list until done.
- Reassigning an owner or listing moves its open reminders to the new member. When an owner or
  listing becomes unassigned, its open reminders become unassigned too (visible to the admin) and
  follow it to the next member it is assigned to.

### Listing
- Purpose: sale or rent. Status: **Available, Sold, Rented, Off market**. Only Available listings
  appear in client search by default.
- Has one assigned member (the member who created it from an owner, or one chosen by the admin).
- A listing whose owner phone matches an owner lead is linked to it, and the lead becomes **Listed**.
- Price is a whole EGP amount from 1 to 1,000,000,000.
- A listing that stops being Available gets no more check-ins.
- Property Finder ad: link, ad status (**Not posted, Live, Taken down**), posted date, last check-in.

### Note
- Free text on an owner or a listing, with author and time. Notes are added, not edited.

### Activity log
- Records imports, assignments and reassignments, deletions, restores, user changes (create, edit,
  deactivate, reactivate, password reset), role changes, settings and call-outcome changes, and
  exports, with who and when. It cannot be edited or deleted.

## Flows

1. **Import.** Upload Excel or CSV → map columns → preview → confirm. Rows whose phone already exists
   (as an owner or a listing's owner) are skipped as duplicates. Rows with no valid phone are rejected.
   The import report lists added, duplicate and rejected rows. If the import fails partway, nothing is
   saved.
2. **Assign.** Admin assigns selected owners to an active member. Reassigning moves the owner, its open
   reminders and its listing (if any) with full history.
3. **Call.** Member taps Call → phone dials → outcome sheet → outcome, note, optional reminder.
4. **Listing from an owner.** Creating a listing from an owner prefills the contact and flags the owner
   **Listed**.
5. **Listing added directly.** Manual or bulk upload; phone match links it to the owner lead.
6. **Client search.** Filters: purpose, type, area, price, size, bedrooms, bathrooms, floor.
7. **Ad follow-up.** While an ad is Live, a check-in reminder is created every 7 days (admin-set
   interval). At each check-in the member records whether the home is still available; if not, the
   listing becomes Off market. Marking a listing Sold, Rented or Off market while its ad is Live
   creates a "Take down the ad" task that closes only when the ad is marked Taken down. An ad can
   go Live only on an Available listing.
8. **Deactivate a member.** The admin chooses who receives their owners, listings and open reminders
   (a member or unassigned) before deactivation completes.
9. **Delete and restore.** Deleted owners, listings and photos are hidden and can be restored by the
   admin for 30 days, then removed for good. A deleted owner keeps its phone numbers until then, so
   nobody else can be added with them. Restoring a listing makes its owner Listed again (refused if
   the owner has another listing by then); a photo is restored only after its listing.
10. **Export.** Admin exports owners or listings, with the current filters, to Excel.
11. **Users.** The admin can reset a member's password (their sessions end) and reactivate a
    deactivated member, who then starts with no owners.

## Invariants

- A team member never sees an owner phone number unless that owner or listing is assigned to them.
  This is enforced by the API, not only hidden in the screen.
- A team member never sees owners assigned to someone else, or unassigned owners.
- No two owners share a normalised phone number.
- A Listed or Do not call owner is never in a calling list.
- Calls and activity log entries are never deleted or edited.
- There is always at least one active admin.
- A deleted record is restorable for 30 days.
- An ad goes Live only on an Available listing.
- A "Take down the ad" task closes only when the ad is marked Taken down.
- Assigning work is done only by users with the assign permission, and only to active members.

## Analytics

Per member and for the team, over a date range (default today): calls made, outcomes breakdown,
reminders done and overdue, assigned owners, interested owners, listings created, ads live and ads
taken down.

## Data protection

- Nightly full database copy kept for 30 days in separate storage.
- Delayed deletion of 30 days for records and photos.
- Point-in-time restore as the database plan allows.

## Money

Not applicable: listing prices are information only, stored as whole EGP amounts.

## Scope

**Version 1:** everything above.

**Planned:**
- Automatic posting and removal of Property Finder ads through its API.
- Push and email notifications for reminders.
- A client (buyer / tenant) requests database with matching.

**Left out:** call recording, in-app calling, WhatsApp, native store apps, live Google Sheets sync.
