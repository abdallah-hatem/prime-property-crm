# Feedback — first local test on a phone and desktop (2026-10-23)

Tested by the user on the local dev server (phone over Wi-Fi at the Mac's LAN address).

- [ ] **Call button does nothing on the phone.** Tapping Call on an owner doesn't open the dialer.
  Status: to fix later. Check the `tel:` link (number format, whether the click is blocked by the
  call-start request or a `preventDefault`), on a real phone.
- [ ] **Tables don't scroll on desktop.** The wheel scrolls the page instead of the table; on mobile
  scrolling is fine. Status: to fix later. Check the table container's overflow/height on desktop
  widths.
