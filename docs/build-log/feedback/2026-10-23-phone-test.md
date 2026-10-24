# Feedback — first local test on a phone and desktop (2026-10-23)

Tested by the user on the local dev server (phone over Wi-Fi at the Mac's LAN address).

- [x] **Call button does nothing on the phone.** Tapping Call on an owner doesn't open the dialer.
  Cause: the dialer was opened only after awaiting `POST /owners/:id/calls` (and, from a reminder
  row, `GET /owners/:id` too). Phones allow `tel:` only during the tap's user gesture; after the
  network wait it was silently blocked. Fixed (2026-10-24): the call request starts and `tel:` opens
  in the same tap; the outcome sheet waits for the call record. A reminder row loads the numbers
  first, then a one-tap Call confirmation opens the dialer. Tests: `call-flow.test.tsx` ("opens the
  dialer inside the tap…", "waits for the call…", "loads the numbers of a reminder row…").
  Confirmed on a real phone by the user (2026-10-24).
- [x] **Tables don't scroll on desktop.** The wheel over a table moved nothing (reproduced: on
  /owners and /activity the page stayed at the top). Cause: each table sits in a sideways scroller
  (`overflow-x-auto`), which CSS also makes a vertical scroll container, and the global
  `.scrollbar-clean { overscroll-behavior: contain }` stopped the wheel from reaching the page.
  Fixed (2026-10-24) in `globals.css`: sideways-only scrollers contain sideways only. Test:
  `e2e/desktop-scroll.spec.ts` (failed before the fix).
- [x] **Call on the phone: "crypto.randomUUID is not a function"** (2026-10-24, phone on the dev
  server by LAN IP over http). Browsers expose `crypto.randomUUID` only on secure pages; production
  is HTTPS, but local phone testing isn't. Fixed: `src/lib/uuid.ts` falls back to
  `crypto.getRandomValues`. Test: `src/lib/uuid.test.ts`.
- [ ] **Times show in 24-hour format; use 12-hour** (2026-10-24, e.g. "9:00 PM", in English and
  Arabic). Status: to fix later — every time shown in the app (reminders, calls, activity, analytics).
