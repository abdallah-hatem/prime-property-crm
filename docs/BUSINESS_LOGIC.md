# Prime Property CRM — Business Logic

Last updated: 2026-10-23 (T5, T6, T7, T8) · Source spec: `docs/specs/2026-10-22-property-crm.md`

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

**Users and roles (built, T5).** Two users never share an email, compared ignoring case and
surrounding spaces. The last active user on the Admin role can't be moved to another role, even by
themself; two admins demoting each other at the same moment leave one of them an admin. Role names
are unique ignoring case. Both built-in roles can be renamed; Admin always holds every permission
and its list can't be edited; Team member's list can. A role still held by any user, deactivated
users included, can't be deleted. A permission change reaches each signed-in user with their next
access token (within 15 minutes). Creating or editing a user, resetting a password, and creating,
editing or deleting a role each write one activity entry; saving with nothing changed writes none.

**Signing in (built, T4).** Email and password; the email ignores case and surrounding spaces. A
wrong password, an unknown email and a deactivated account get the same answer, so nobody can tell
which emails exist. After 10 failed attempts in 15 minutes for one email, sign-in for that email is
refused until the oldest failure is 15 minutes old; a successful sign-in clears the count. A session
lasts 30 days of inactivity and renews itself while used; signing out ends that device's session.
If an old session key is used again more than 30 seconds after it was renewed, the whole session is
ended (a copied key stops working); within 30 seconds it still works, so two open tabs renewing at
once don't sign the user out. A deactivated user is locked out at once,
even mid-session. Changing your own password ends your other sessions; a password reset by the admin
ends all of them. Role and permission changes reach a signed-in user within 15 minutes.

## Entities and rules

### Owner (homeowner lead)
- Identified by a normalised phone number (international format, Egypt +20 by default), with up to
  three phone numbers. Two owners can never share a phone number.
- Has at most one assigned member at a time. Unassigned owners are visible to the admin only.
- Lead status: **New → Contacted → Interested / Not interested / Call back**, plus **Listed** and
  **Do not call**. The latest call outcome sets the status, through the outcome's mapping.
- **Listed** and **Do not call** owners never appear in any calling list.
- A member can mark their own owner **Do not call**; only the admin can clear it (the owner goes
  back to Contacted). A **Listed** owner can't be marked Do not call: it leaves the calling list
  through its listing.
- An owner and its listing always have the same member: reassigning either moves the other.
- Calling list order: owners with an overdue reminder (open, due before now), then a reminder due
  later today (Cairo time), then New, Call back, Contacted, Interested, Not interested; within each,
  never-called owners first, then the one called longest ago, ties by the oldest added.
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

**Calls, outcomes and reminders (built, T7).** A call is started only on an owner assigned to the
caller (not even the admin calls someone else's owner) and only on one of that owner's numbers. A
repeated tap by the same member returns the call already made (the same tap reused for a
different owner is refused). Calling a **Listed** or **Do not call** owner is refused. Starting a call moves the owner's last call time, which
orders the calling list. The outcome is set once, by the member who made the call. It sets the lead
status unless a newer call already has an outcome. It never changes a **Listed** owner (only the
listing does) or a **Do not call** owner (only the admin clears it). An outcome on a call whose
owner is in the trash is saved without a status change, but one that also asks for a reminder is
refused (restore the owner first). The outcome's optional reminder goes to the owner's current
member. If that reminder is in the past, nothing is saved, the outcome
included. Outcome names are shown in each user's own language. Hidden outcomes can't be picked.
Creating, editing or deleting an outcome writes one activity entry; saving with nothing changed
writes none. Only an outcome no call has ever used can be deleted.

A reminder is due in the future when it is created or moved. A member sees only their own
reminders; whoever may assign also sees the unassigned ones, and whoever may see analytics can look
at any member's. Only its member edits it or marks it
done. A done reminder can't be edited; marking it done again changes nothing. "Take down the ad"
tasks and ad check-ins can't be marked done by hand. A take-down task's due time can't be moved;
a check-in's can. Reminder lists put open reminders first, earliest due first, so overdue ones
lead; done ones follow. Reminders of an owner or listing in the trash are hidden. The today screen
shows calls still missing an outcome, manual reminders overdue and due later today (Cairo), the
ad tasks (every open take-down task, and check-ins due by the end of today), the number of calls
made today and the number of open reminders.

### Listing
- Purpose: sale or rent. Status: **Available, Sold, Rented, Off market**. Only Available listings
  appear in client search by default.
- Has one assigned member (the member who created it from an owner, or one chosen by the admin).
- A listing whose owner phone matches an owner lead is linked to it, and the lead becomes **Listed**.
- Price is a whole EGP amount from 1 to 1,000,000,000. Size is above zero; bedrooms and bathrooms
  are zero or more.
- Two live listings never share an owner phone, and an owner has at most one live listing.
- A listing that stops being Available gets no more check-ins.
- Property Finder ad: link, ad status (**Not posted, Live, Taken down**), posted date, last check-in.

**Listings, ads and photos (built, T8).** Everyone can search and open every listing. The owner's
phone shows only to the listing's member and to whoever may manage all listings, and never in the
search results. A phone search matches only listings whose phone the searcher may see. A listing's
title is made from its type, bedrooms and area, in the reader's language. Only the listing's member
(or someone who manages all listings) changes it: details, status, ad, check-ins, notes and photos.
Anyone else is refused. Only someone who assigns work picks or changes a listing's member.
- From an owner: the owner's details fill the contact, the owner becomes **Listed** and the listing
  goes to the owner's member. An owner with a live listing can't get a second one.
- Added directly: the listing goes to its creator unless the assigner picks someone. A phone of an
  owner lead links the two, the lead becomes **Listed** and moves (with its open reminders) to the
  listing's member, logged as an assignment. A phone already on another live listing, or on an
  owner in the trash, is refused.
- Editing the phone: refused when another live listing or another owner has that number.
- Status: leaving Available closes the open check-in. While the ad is Live it also opens one "Take
  down the ad" task, never a second while one is open. Back to Available with the ad still Live,
  check-ins start again.
- Ad: Live needs a link and an Available listing. The first check-in is due one interval (the
  setting at that moment) after it goes Live. Saving a Live ad again adds no check-in. Taken down
  closes the take-down task and any open check-in and records when. Back to Not posted stops
  check-ins, but an open take-down task stays until the ad is marked Taken down.
- Check-in: only on a Live ad of an Available listing. It records the time, closes the open
  check-in and schedules the next one with the current interval. The optional note is added to the
  listing's notes. "No longer available" makes the listing Off market, which opens the take-down
  task. A check-in counts as due when it is due by the end of today (Cairo).
- Deleting a listing closes all its open reminders and sends its owner back to Interested.
  Restoring it brings the owner back to Listed and to the same member as the owner. A Live ad gets
  its check-in back, or a take-down task if the listing is no longer Available. A restore is
  refused if the owner has another listing by then, or if the phone now belongs to another listing
  or owner.
- Photos: up to 30 per listing. Uploads go straight to the photo store into that listing's folder:
  JPEG, PNG or WebP, up to 10 MB each. Only files from our store, in that listing's folder, can be
  added. Adding the same file twice adds it once. The first photo is the cover, and a new order
  must list every photo once. A deleted photo goes to the trash. When restored, it goes back to the
  end of the list.

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
2. **Assign.** Admin assigns selected owners to an active member (or to nobody). Reassigning moves the
   owner, its open reminders and its listing (if any) with full history; deleted owners in the
   selection are skipped. Each batch that moves something is one activity-log entry with the count
   (a batch that moves nothing writes none). To pick owners to assign ("select all", "next 200
   unassigned"), anyone who may assign can list the ids of every owner — ids only, with no phone
   search unless they may also see all owners.
3. **Call.** Member taps Call → phone dials → outcome sheet → outcome, note, optional reminder.
4. **Listing from an owner.** Creating a listing from an owner prefills the contact and flags the owner
   **Listed**.
5. **Listing added directly.** Manual or bulk upload; phone match links it to the owner lead.
6. **Client search.** Filters: purpose, type, area, price, size, bedrooms, bathrooms, floor.
7. **Ad follow-up.** While an ad is Live, a check-in reminder is created every 7 days (admin-set
   interval, 1 to 90 days). At each check-in the member records whether the home is still available; if not, the
   listing becomes Off market. Marking a listing Sold, Rented or Off market while its ad is Live
   creates a "Take down the ad" task that closes only when the ad is marked Taken down. An ad can
   go Live only on an Available listing.
8. **Deactivate a member.** The admin chooses who receives their owners, listings and open reminders
   (a member or unassigned) before deactivation completes.
9. **Delete and restore.** Deleted owners, listings and photos are hidden and can be restored by the
   admin for 30 days, then removed for good. A deleted owner keeps its phone numbers until then, so
   nobody else can be added with them. Restoring a listing makes its owner Listed again (refused if
   the owner has another listing by then); a photo is restored only after its listing. A restored
   owner is Listed if it still has a live listing, goes back to Interested if it was Listed but its
   listing is gone, and comes back unassigned if its member was deactivated meanwhile.
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
