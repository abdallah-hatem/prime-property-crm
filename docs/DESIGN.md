# Prime CRM — Design direction

**Approved look:** A1 "Switchboard Soft" (2026-10-22). Reference mockup:
`docs/design/approved-direction-a1-soft.html`. Values live only in code:
`apps/web/src/app/globals.css` (tokens, light and dark) and `apps/web/src/lib/motion.ts`. This file
holds the direction, never the values. The living style guide is `/design` in development.

## Feel

Calm, quick, soft-edged, sure of itself. A switchboard for a team that spends the day on the phone:
the next thing to do is always the loudest thing on screen, and everything else steps back. Rounded
cards on a cool page, lifted by soft shadows instead of outlined by boxes.

## Layout

- Phone first (390 px is the reference width), then tablet and desktop.
- Today opens with the counter board: three counters (overdue, due today, calls without an
  outcome), then lists of owner rows.
- An owner row carries an urgency marker at its start edge, who and where, a status chip, when,
  and the Call button at its end edge. The marker and the button mirror under Arabic.
- Bottom tab bar and action docks float as frosted pills above the content.

## Colour roles

| Role | What it is for |
|---|---|
| `primary` (+ `primary-end` gradient) | The one colour that means **act**: Call, Save, the active tab, the selected segment. One gradient button per view. |
| `primary-soft` / `primary-soft-foreground` | Secondary actions that still belong to the main flow ("Log check-in"), the New chip. |
| `accent` | shadcn's quiet hover and highlight surface; a whisper of the primary hue. Not amber. |
| `urgency` (+ `urgency-soft`) | Amber, **only** when something is waiting on the user: an outcome missing, a check-in due, the check-in marker. Never decoration. |
| `destructive` (+ `destructive-soft`) | Overdue counter, overdue marker and "late" text, delete actions. Nothing else is red. |
| `success` / `warning` (+ soft) | Status chips: interested, ad live; call back, take-down pending. |
| `background`, `card`, `secondary`, `muted` | Cool page, white (or deep navy) surfaces, a tinted second surface for chips and soft buttons. |
| `foreground`, `muted-foreground` | Text and secondary text. |
| `border`, `input`, `ring` | Hairlines (rare; shadows do the separating), field borders, focus ring. |
| `chart-1`…`chart-5` | Analytics series: primary, violet, success, amber, slate. |

Every text-and-background pair passes WCAG AA in both themes. Two mockup values were deepened in
light mode to get there (success and warning chip text, the danger red). Destructive text on
`destructive-soft` is AA only at large sizes (the overdue counter); small text on it uses a chip.

## Type

- **Plus Jakarta Sans** for Latin text and for every numeral (counters, prices, phone numbers), in
  both languages: `font-numeric`.
- **IBM Plex Sans Arabic** for Arabic. It leads the font stack when the page is Arabic, and any
  block marked `lang="ar"` switches on its own, so mixed lines read as one voice.
- Scale (utilities `type-display`, `type-title`, `type-h1`, `type-h2`, `type-body`, `type-label`,
  `type-caption`, `type-counter`): at most three or four sizes per screen. Hierarchy from size,
  weight and colour together.
- Latin headings are tight (negative tracking); Arabic never gets negative tracking and gets more
  line height.
- Sentence case everywhere. No all-caps labels.

## Radius

- **12** controls (inputs, small tiles), **18** rows and counters, **24** cards and panels,
  **28** sheets and the phone-sized preview, **pill** for buttons, chips, tabs and segmented
  controls.
- Radius follows hierarchy: a thing inside a card is rounder-smaller than the card.

## Shadow

Three soft, layered shadows plus one glow, all theme-aware:

- `shadow-soft` — chips, small tiles, inputs.
- `shadow-raised` — cards, rows, counters, docks. The default lift.
- `shadow-float` — something above the page (the phone preview, sheets).
- `shadow-glow` — only under primary-gradient buttons and the avatar. It settles on press.

Dark mode swaps to deeper shadows with a faint inner top highlight instead of lighter surfaces.

## Motion

- 200–250 ms, `ease-snappy` (an ease-out). Exits at 150 ms. Never `ease-in`, never over 300 ms.
- Buttons press to 97% and their glow settles in 200 ms. Nothing bounces.
- Counters rise 6 px and fade in, 50 ms apart, when Today opens or a count changes. Rows don't
  animate.
- A live ad's dot sends out a soft ring every two seconds; it is the only looping motion.
- Sheets slide up in 250 ms and close in 150 ms.
- Transform and opacity only. Horizontal motion and direction icons flip under Arabic
  (`flip-rtl`).
- Reduced motion: no movement, no ripples; state changes become quick fades.

## Do not

- Hex codes or palette classes in components (`bg-blue-500`, `text-[#…]`); tokens only.
- Amber for anything that isn't waiting on the user; red for anything that isn't overdue or
  destructive.
- More than one gradient button per view.
- Outlined boxes and hard borders to separate content; use space and the soft shadows.
- One radius for everything, or square corners.
- Monospace labels, all-caps eyebrows, decorative gradients washing the background.
- A Latin-only font anywhere Arabic can appear; negative tracking on Arabic.
- Physical direction utilities (`pl-`, `left-`); logical ones only.
- Native scrollbars; every scroll container uses `scrollbar-clean`.
- Animations a user has to wait for, or motion on actions done many times a day.
