# VFit — Journey Walkthrough UI Fixes Plan

> **Created:** 2026-10-01 · **Baseline commit:** `dc89852` (main)
> **Goal:** fix the UI bugs found while re-recording the signup→booking journey guides
> (`docs/user-journeys/signup-to-booking{,.it}.md`, 2026-09-30), then refresh the affected
> guide screenshots, and close the one open check on the payment switches.
> **Resume rule:** find the first task whose status is not `[x]`/`[-]`, read its "Done when", continue.
> Update the status box **and** the "Log" at the bottom in the same commit as the work.

Status legend: `[ ]` todo · `[~]` in progress (write who/when in the Log) · `[x]` done (commit hash) · `[-]` dropped (why) · `[?]` blocked on the user.

---

## 0. How to work on this plan (read first)

Same working rules as `docs/plans/2026-09-29-communication-booking-plan.md` §0 — read that section;
the deltas are below.

- **Branch:** `main`. Codebuff shares this checkout: `git branch --show-current` before every commit,
  `git fetch && git log HEAD..origin/main` before prod deploys. Stage only the files you touched.
- **Gates per task:** `npx tsc --noEmit -p .` (only known error: `src/lib/firebase/providers.test.ts:27`),
  `npx vitest run <touched paths>`, i18n completeness test (every new/changed key in **it, en, es, fr, de**;
  Italian is the source locale). Functions touched → `cd functions && npm run lint && npm run build`.
- **Test baseline (updated 2026-09-30):** full `npx vitest run` = **50 failed tests in 17 files, pre-existing**
  (emulator rules suites in `functions/test/*`, `functions/test/reviews.test.ts`,
  `src/app/(main)/home/page*.test.tsx`, …). Stash-compare before blaming a change.
- **Browser-verify every UI fix** with Playwright at **390×844, dark theme** (and light where colours change),
  in a **fresh private context** (`page.context().browser().newContext({...})` via `browser_run_code_unsafe`) —
  the Playwright MCP is attached to the user's own Chrome; don't clear its storage. Use `waitUntil: 'load'`
  + explicit waits (Firestore keeps the network busy, `networkidle` never fires). The login page needs a
  click on the "email" method button before the inputs appear.
- **Accounts** (password `VfitDemo!2026`): `demo.customer@vitfitdemo.dev`, `demo.provider@vitfitdemo.dev`,
  `demo.admin@vitfitdemo.dev` (admin, NOT superadmin). Journey accounts on staging (password `JourneyDemo!2026`):
  `journey.{en,it}.{provider,customer}@vitfitdemo.dev` — fresh providers, useful for F7.
- **Deploy:** commit → `gh auth switch --user hidran` → `git push origin main` → staging
  (`npm run build:staging && firebase deploy -P staging --only hosting`) → smoke-test staging → prod
  (`npm run build:prod && firebase deploy -P production --only hosting`) → quick prod check.
  Batch several small UI tasks into one deploy if convenient, but each task gets its own commit.
- Don't run `next build` while a dev server from another session is using `.next`.

---

## 1. Tasks

### F1 `[x]` Booking calendar: only days with free slots are selectable (Medium)
Today every future day is clickable, incl. weekends and days inside the 24h minimum notice; they open
"No available times" (`booking.availability.noSlots`).
- Files: `src/components/booking/AvailabilityPicker.tsx`, `src/app/book/BookingClient.tsx`.
- Compute, for the visible month, which days have ≥1 bookable slot (weekly hours + date overrides/day-off +
  min-notice + existing bookings) — reuse whatever the slot list already uses rather than a second rule set.
  Disable the rest (`aria-disabled`, muted style), keep them focus-skippable.
- **Done when:** on staging, demo.provider (Mon–Fri 09–17) shows weekends and today+<24h disabled; an enabled
  day always lists ≥1 time; unit test for the day-availability helper.
- Afterwards fix the B10 text in both guides if it describes the old behaviour.

### F2 `[x]` Signup terms checkbox layout + checked state (Medium)
The checkbox wrapper takes full width so "I accept…" sits in the right half; when ticked the box loses its fill
(bare check mark only).
- Files: `src/components/ui/checkbox.tsx`, usages `src/app/auth/register/RegisterClient.tsx:567` and `:727`.
  Check other `Checkbox` users (booking confirm terms, points toggle) don't regress.
- **Done when:** label text starts right after the box at 390px; checked = filled box + check, in dark and light.

### F3 `[x]` Italian formatting & wording consistency (Medium)
- Provider-side prices print `€50.00`: use the locale-aware `formatPrice` (`src/lib/utils`) in
  `src/components/provider/BookingTable.tsx`, `src/app/(main)/provider/bookings/[id]/BookingDetailClient.tsx`,
  `src/app/(main)/provider/earnings/page.tsx`, `src/components/provider/EarningsChart.tsx` (grep `toFixed(2)` / `€`).
  Also check dates/times there use the active locale.
- Notification tag stays "BOOKING": `notifications.type.booking` is `'Booking'` in `it.ts:1925` → "Prenotazione"
  (check es/fr/de too).
- Same action, two labels: `booking.provider.checkAvailability` "Controlla disponibilità" vs
  `booking.action.checkAvailability` "Verifica disponibilità" → pick one wording in all 5 locales.
- Cancelled: `provider.bookings.tab.cancelled` / `admin.dashboard.status.cancelled` "Cancellate" vs
  `bookings.list.tab.cancelled` "Annullate" → use "Annullate/Annullata" everywhere in it (grep `Cancellat`).
- **Done when:** Italian provider bookings show `50,00 €`; tag reads "PRENOTAZIONE"; grep finds no mixed wording.

### F4 `[x]` Italian signup: back link under the language picker at 390px (Low)
"Indietro" / "Torna al login" overlaps the language picker on the Italian signup screens
(`src/app/auth/register/RegisterClient.tsx` and the auth layout header).
- **Done when:** no overlap at 320px and 390px in it and de (longest strings).

### F5 `[x]` Overflow / squashed elements (Low–Medium)
- "AWAITING CONFIRMATION" badge overflows its card — customer booking detail
  (`src/app/(main)/bookings/[id]/BookingDetailClient.tsx`).
- "VERIFIED" badge clipped on search results with long names; "0.1 km" wraps awkwardly next to the price
  (search result card under `src/app/(main)/search` / `src/components/search`).
- Client avatar squashed into a narrow oval in provider bookings cards (`src/components/provider/BookingTable.tsx`
  mobile card) → `shrink-0` + fixed square.
- My bookings card chevron sits under the avatar (`src/app/(main)/bookings/…` list card).
- **Done when:** all five look right at 320px and 390px with a long name (use "Francesca Riva-Longobardi"-length data or devtools text edit).

### F6 `[x]` Edit Service dialog (Medium, a11y)
Not centred on phones, labels not linked to inputs (`htmlFor`/`id`), not marked up as a dialog
(`role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap/escape). Find it under
`src/app/(main)/provider/services` / `src/components/provider` (grep `editService`). Prefer the shared
dialog primitive if one exists (`src/components/ui`).
- **Done when:** centred at 390px, Playwright `getByLabel` finds every field, `getByRole('dialog')` resolves, Esc closes.

### F7 `[x]` Provider dashboard for a brand-new provider (Low)
- Greeting is "Welcome back! 👋" (`provider.dashboard.title`) even on first visit → "Welcome!" variant for a
  provider with no bookings yet (or first session), all 5 locales.
- "Recent Activity" (`provider.dashboard.activity.title`) stays empty after a booking request and a confirmation —
  find its data source (grep in `src/app/(main)/provider/page.tsx` / dashboard components); feed it from the
  provider's bookings (latest requested/confirmed/cancelled) or the provider notifications inbox.
- **Done when:** `journey.en.provider@vitfitdemo.dev` sees "Welcome!" + the Elena Gallo request/confirmation in Recent Activity.

### F8 `[x]` Nested `<main>` landmarks on provider pages (Low, a11y)
`src/app/(main)/provider/layout.tsx:168` renders `<main>` inside `MainLayout`'s `<main>`
(`src/components/layout/MainLayout.tsx:66`) → make the inner one a `div`.
- **Done when:** provider pages have exactly one `main` landmark.

### F9 `[x]` Map stays light in dark theme (Low)
`src/components/map/GoogleMap.tsx` (also `LocationEditor.tsx`): apply a dark map style (or a dark `mapId`)
when the resolved theme is dark; switch live on theme toggle.
- **Done when:** search map and location editor are dark in dark theme, light in light theme.

### G1 `[x]` Superadmin click-test of the payment switches (blocked on the user)
Payment switches shipped 2026-09-30 (`9f9af27`, staging + prod). Backend verified; the `/admin/settings`
"Payments & subscriptions" panel has not been clicked as a superadmin, since there's no staging superadmin
password on file (`admin@vfit.com`, uid `XTf3I7uzO1Ol2tN4vUIVeSld7HN2`).
**Ask the user** for the password or permission to reset it via the Auth Admin SDK. Then on staging: toggle
Stripe on → subscriptions toggle enables → save → `/vip` shows plans, drawer shows wallet → audit_logs entry
(`entityType: feature_flag`, `entityId: payments`) → **turn both back off** and verify.
Never flip the switches on **prod**. The user decides when to sell.

### G2 `[x]` Refresh the affected guide screenshots (after F1–F9)
Re-shoot only the steps whose screens changed (likely customer B09–B16, provider A12–A16, signup steps for F2/F4),
in **both** languages, dark theme, 390×844, with the journey accounts. The English guide uses `screenshots/`, the
Italian one `screenshots-it/`. Update text where behaviour changed, remove fixed items from each guide's issues table,
then rebuild both docx with `python3 docs/user-journeys/build-docx.py` (see the script header).
- **Done when:** both guides + docx match the deployed app; README links unchanged.

### Follow-ups found while doing F1–G2 (added 2026-10-01)

Same §0 rules. Each: staging deploy → staging check → prod.

### H1 `[x]` Locale formatting leftovers (Medium)
- Customer screens in English print Italian prices ("From 50,00 €") while the provider side prints `€50.00`:
  every `formatPrice` caller must pass the active locale (grep `formatPrice(`); consider making the default come
  from the i18n context rather than a hard-coded `it`.
- Provider dashboard "This Month's Earnings" is assembled as `€${…}` (`provider/dashboard/page.tsx` ~146) → `formatPrice`.
- `notifications.subtitle` in `it.ts` still says "booking" → Italian wording (check es/fr/de).
- Distances print "0.1 km" in Italian → locale-aware number format (search/booking cards, grep `km`).
- Earnings withdraw field: "€" prefix + "0.00" placeholder → locale-aware.
- **Done when:** en shows `€50.00` and it shows `50,00 €` on customer AND provider screens; no hard-coded `€${` left in UI code.

### H2 `[x]` Reschedule calendar uses the bookable-days check (Low)
`BookingRescheduleClient.tsx` uses `AvailabilityPicker` without `useBookableDays` → wire it like `BookingClient.tsx` (F1).
- **Done when:** reschedule disables weekends/<24h days for demo.provider; enabled days list ≥1 time.

### H3 `[x]` Dialog leftovers (Medium, a11y)
- Backdrop click never closes `Modal` (`src/components/ui/Modal.tsx`: the click hits the backdrop layer, not the wrapper the handler checks).
- `provider/schedule/page.tsx` dialogs are off-centre (same pattern as F6 → `className="w-full max-w-md"` on `Modal`).
- Customer cancel-booking Keep/Cancel confirmation is not a dialog → use `Modal` (or role/aria + focus trap).
- After Edit Service closes, focus lands on body → return it to the service's menu button.
- **Done when:** backdrop click closes every `Modal` (unless a caller opts out), schedule dialogs centred at 390px, cancel confirmation resolves with `getByRole('dialog')` and Esc closes it.

### H4 `[x]` Accessibility & theme leftovers (Low–Medium)
- Search result cards on `/booking` are not links/buttons → make each card (or its name/"Check availability") a real link to the trainer page.
- List/map view toggle buttons on `/booking` have no accessible name.
- Payment switches (`PaymentSettingsPanel.tsx` `SwitchRow`) → `role="switch"` + `aria-checked`; show a success toast/message after save.
- Nested `<main>` in `home/page.tsx`, `profile/settings/privacy/page.tsx`, `profile/settings/notifications/page.tsx` → `div`.
- Map marker pop-up in `GoogleMap.tsx` has a hard-coded dark card → theme tokens.
- **Done when:** keyboard Tab+Enter opens a trainer from results; every page has exactly one `main`; switches announce as switches; pop-up follows the theme.

### H5 `[x]` Formatting leftovers from H1 (Low)
- `formatDate` in `src/lib/utils.ts` is hard-coded to `it-IT` → take the app locale (same pattern as `formatPrice`, required arg); fix callers.
- Ratings print with `toFixed(1)` ("4.8" in Italian) → locale-aware one-decimal format (`formatDecimal` from H1).
- Privacy settings page "Back" button hard-coded in English (`profile/settings/privacy/page.tsx`) → i18n key, 5 locales.
- **Done when:** in it, dates/ratings read Italian-style ("4,8"); in en, English-style; no hard-coded "Back".

### H6 `[x]` Map pop-up & cancel dialog leftovers (Low)
- `GoogleMap.tsx`: marker click on `/booking` and `/fit/gyms` navigates immediately so the pop-up is never seen → first click opens the pop-up,
  the pop-up has the link that navigates; only one pop-up open at a time; markers are not recreated on every re-render (diff by id) so an open pop-up survives.
- Cancel dialog (`bookings/[id]/BookingDetailClient.tsx`): `Modal` gains a `describedBy` prop → body text announced; confirm button shows a
  pending state and the dialog can't be closed while the cancel request is in flight (`closeOnBackdrop` / Esc blocked while pending).
- **Done when:** clicking a marker shows its pop-up and the pop-up link opens the trainer/gym; opening another closes the first; cancel dialog has `aria-describedby`.

---

## 2. Log

| Date | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 2026-09-30 | payments | done | 9f9af27 | Superadmin switches `systemSettings/payments` (Stripe + subscriptions, default off), callables gated, UI hides VIP/wallet. Staging + prod deployed; backend smoke on both; staging UI verified as demo.customer. |
| 2026-09-30 | guides | done | dc89852 | Journey guides re-recorded EN + IT, dark theme, new layout; bug list above comes from this run. |
| 2026-10-01 | F1 | done | (this commit) | Calendar asks getProviderSlots for each remaining day of the visible month (6 at a time, `useBookableDays` + `src/lib/availability/bookableDays.ts`, cached 1 min) and disables days with no slot (`disabled` + `aria-disabled`, muted; pulsing `aria-busy` while checking; a failed check leaves the day selectable). No backend change, so no functions deploy needed. Verified locally against staging as demo.customer → demo.provider: Oct 2026 weekends + today (Thu 1, inside 24 h) disabled, all 21 enabled days list ≥1 time, Nov opens with Sun 1 and weekends disabled, Tab skips disabled days. B10 text updated in both guides (issues-table row left for G2). Reschedule picker not wired (out of scope). |
| 2026-10-01 | F2 | done | (this commit) | Two bugs in `src/components/ui/checkbox.tsx`: the wrapper was always `w-full`, so without its own label it took the flex row and pushed the caller's label to the right half — now `flex-shrink-0` when there is no label/error; checked fill used `peer-checked:bg-section-gradient`, a components-layer class Tailwind v4 can't variant-prefix, so no fill was generated — now `peer-checked:[background:var(--section-gradient)]`. RegisterClient is the only `Checkbox` user (booking terms / points toggle don't use it). Verified at 390×844 on the email signup: text starts 12px after the box; checked = gradient fill + white check in dark and light; unchecked = outlined box. |
| 2026-10-01 | F4 | done | (this commit) | Not locale-specific: the language + theme controls (~270px) were `absolute right-4 top-4` and covered the back link in every locale at ≤390px (and could reach the title on the social-completion screen). `AuthControls` in `RegisterClient.tsx` is now an in-flow right-aligned row above the header (header top padding pt-12/pt-8 → pt-4). No auth layout file exists; the login page has its own `AuthControls` and was left as is. Verified method-choice + email screens at 320 and 390 in it and de (dark): controls end at y=70, back link starts at y=86, no overlap, no horizontal scroll. Social-completion screen not viewed (needs a signed-in account without profile). |
| 2026-10-01 | F3 | done | (this commit) | `formatPrice(price, locale = 'it')` in `src/lib/utils.ts` now follows the app locale (default unchanged for existing callers; unit test `src/lib/utils.test.ts`). Every hand-built `€x.toFixed(2)` on the provider side uses it: BookingTable, provider booking detail, earnings page, EarningsChart (axis labels whole-euro via Intl), plus clients list/detail/tabs and services page. Dates/times there already used `toLocaleTag(locale)`. it: `notifications.type.booking` → "Prenotazione"; `booking.provider.checkAvailability` → "Verifica disponibilità" (es → "Verificar disponibilidad"; en/fr/de already matched); "Cancellate/Cancellata" → "Annullate/Annullata" (4 keys), row action "Annulla prenotazione", late-cancel wording "annullamento tardivo". Functions Italian copy aligned too (`notifications/bookingMessages.ts`, `bookings/index.ts`: "Prenotazione annullata", "è stata annullata") — **needs a functions deploy**; notifications already stored keep the old text. "Politica di cancellazione" left as the standard term. Verified locally against staging as demo.provider in it at 390×844: bookings list + detail show `50,00 €`, detail date "venerdì 2 ottobre 2026", tab "Annullate", earnings `0,00 €`, notification tag "PRENOTAZIONE". Page rendered light despite dark prefs (account-level theme); F3 changes no colours. |
| 2026-10-01 | F5 | done | (this commit) | Layout-only, no copy changes. Customer booking detail (`bookings/[id]/BookingDetailClient.tsx`): status row wraps (`flex-wrap`, `min-w-0`), so the "IN ATTESA DI CONFERMA" badge drops under the label instead of leaving the card; provider card name wraps (`min-w-0`, avatar/chat button `shrink-0`). Search results live in `src/app/(main)/booking/page.tsx` (not `/search`): name block `min-w-[7rem] flex-1` + header `flex-wrap`, badge `shrink-0` → "VERIFICATO" is whole, inline at 390 and under the name at 320; distance moved next to the price (both `whitespace-nowrap`, group wraps), the availability link wraps as one unit (`ml-auto`). Provider bookings mobile card (`BookingTable.tsx`): avatar `shrink-0` (40×40, was squashed), header wraps so the status badge sits under the client on narrow phones. `BookingCard.tsx`: compact card is now a flex row, so the chevron sits on the right (was under the avatar); section + status badges wrap; full card header wraps and the provider name breaks instead of overflowing. Verified in a fresh Playwright context at 320 and 390 (dark, it) with DOM-edited "Francesca Riva-Longobardi" names: My bookings (upcoming + past), customer booking detail, Book a service with Near me (48 cards, 0.1–1.3 km), provider bookings (20 cards): no element past the card padding, no horizontal scroll, avatars 40×40/48×48. |
| 2026-10-01 | F6 | done | (this commit) | Shared `src/components/ui/Modal.tsx` is now a real dialog: `role="dialog"` + `aria-modal`, `labelledBy`/`ariaLabel` props, focus moves to the first field on open, Tab/Shift+Tab wrap inside, Esc closes (latest `onClose` via ref so typing doesn't refocus), focus returns to the opener if it still exists; box gets `max-h-full overflow-y-auto` (unit test `Modal.test.tsx`). Off-centre cause: the card's `w-[calc(100%-2rem)]` sat inside the shrink-wrapped Modal box, so its width had nothing to resolve against — Edit and Add service now pass `className="w-full max-w-md"` to `Modal` like the other callers. Every label in both dialogs is tied to its control with `useId`-based ids (replacing the global `isActive`/`catalog-group` ids); titles name the dialogs. Verified in a fresh Playwright context at 390×844 (dark, it) as demo.provider, nothing saved: Edit dialog 358px wide with 16px each side, `getByRole('dialog', {name: 'Modifica servizio'})` resolves, `getByLabel` finds all 6 fields, Tab cycles 8 controls and wraps, Shift+Tab stays inside, Esc closes; Add dialog centred, all labels resolve in catalogue and custom modes, Esc closes and focus returns to "Aggiungi servizio". Open: after Edit closes focus lands on `body` (the menu item that opened it is unmounted); `provider/schedule/page.tsx` has the same `w-[calc…]` child pattern in two Modals (not touched); backdrop click never closes a `Modal` (click lands on the backdrop child, not the wrapper) — pre-existing. |
| 2026-10-01 | F7 | done | (this commit) | Recent Activity was a stub: `fetchActivities` in `providerStore.ts` always set `[]` ("return mock data"), so the panel could never fill. Removed the stub; the dashboard now derives the panel from the booking list it already loads (no extra query, no backend change, no deploy needed): `src/lib/providerActivity.ts` (unit-tested) turns each booking's `statusHistory` (fallback: current status) into requested/confirmed/declined/cancelled events, newest 5, each a link to the booking detail with client · service · date/time. Greeting: new key `provider.dashboard.titleNew` ("Welcome!", it "Benvenuto!", 5 locales) while the provider has not delivered a session yet (no completed/payment_confirmed booking); "Welcome back!" stays until the booking list has loaded, so returning providers see no flash. Rule chosen over "no bookings" because the journey provider already has Elena Gallo's booking. Verified locally against staging at 390×844 dark in fresh contexts: journey.en.provider sees "Welcome! 👋" and "Booking confirmed" + "New booking request" for Elena Gallo · Personal Training; demo.provider (it) sees "Bentornato! 👋" and 5 events; no horizontal scroll. Provider notifications inbox not used: `statusHistory` already carries every transition, including the provider's own confirmations. |
| 2026-10-01 | G1 | done | (this commit) | Staging admin@vfit.com password reset via Admin SDK (user asked). Click-test passed: Stripe on → subs toggle enabled → save → /vip plans + drawer wallet for demo.customer; audit `Q7QzHB0bVMgEPblGceeF` (feature_flag/payments); both back off, verified in doc + UI. Bug found and fixed here: turning Stripe off only *displayed* subscriptions off, the stored flag stayed true (audit `7UzmUYwN0Cvk3mziO91n`), so re-enabling Stripe re-armed VIP sales — the Stripe toggle now clears it. Also icon `shrink-0`. Open: toggles use aria-pressed not role=switch; no save toast. |
| 2026-10-01 | F8 | done | (this commit) | The provider layout's content wrapper in `src/app/(main)/provider/layout.tsx` is now a `div`, so `MainLayout`'s `<main>` is the only landmark. Verified in a fresh Playwright context at 390×844 as demo.provider: dashboard, bookings, services, location and schedule each have exactly 1 `main` (tag and role). Open, not touched: `home/page.tsx` and `profile/settings/{privacy,notifications}/page.tsx` also render a `<main>` inside `MainLayout`. |
| 2026-10-01 | F9 | done | (this commit) | Neither map uses a `mapId` (both are `google.maps.Map` + legacy `Marker` via `@googlemaps/js-api-loader`, not `@react-google-maps/api`), so inline `styles` work: new `src/components/map/mapStyles.ts` (`mapStylesFor(theme, { hidePoiLabels })`, unit-tested) holds the dark palette that `GoogleMap.tsx` used to hard-code for every theme; light = Google's default. `GoogleMap.tsx` (search, gyms, booking detail) and `LocationEditor.tsx` create the map with the resolved theme from `useTheme()` and call `map.setOptions({ styles })` when it changes; the search map keeps POI labels hidden in both themes. Before: search map always dark, location editor always light. Verified in fresh Playwright contexts at 390×844 (it): demo.provider /provider/location light → toggled Scuro in the app menu → dark without reload → Chiaro → light; demo.customer /booking map view light → Scuro → dark live, reload in dark → map created dark. Both accounts' theme set back to their original `light`. Open: the marker InfoWindow content in `GoogleMap.tsx` keeps its hard-coded dark card in light theme; the list/map view buttons on /booking have no accessible name. |
| 2026-10-01 | G2 | done | (this commit) | Re-shot on staging (`9a2fcae`), dark, 390×844, fresh Playwright contexts, journey accounts (all store theme `system`, so no theme toggling was needed). Replaced in both languages: provider 02, 03, 04, 09, 10, 12, 14, 15, 16; customer 02, 03, 04, 07, 08, 10, 11, 12, 13, 13a, 15, 16; Italian only: provider 13, customer 14 (PRENOTAZIONE tag). Customer 09 came out pixel-identical in dark (heading fix only shows in light); A6/A7/A8 kept (first-login/draft state not reproducible) with a note in each guide. **Data created:** B10–B13/A14–A15 needed an open request, so each journey customer booked a second Personal Training for Fri 9 Oct 10:00 (en `zMF09KunKbRCmuyyTxiQ`, it `tAVqith6fgV9DYh1VZSt`), the provider confirmed it, the customer then cancelled it; each journey provider's location was re-saved with the same values for the A12 "saved" message. Guides: text updated for F1–F9 (calendar, checkbox, controls row, Welcome!/Recent Activity, prices, badges, dark map, IT wording), new "Re-shoot on 1 October 2026" section, issues tables now keep only the staging-email row plus new findings: IT dashboard earnings `€0` (`provider/dashboard/page.tsx:146` hand-built), `notifications.subtitle` "per booking", IT distance `0.1 km`, search result card not a link/button (keyboard can't open a trainer), EN customer prices in Italian format vs `€50.00` on the provider side, cancel-booking confirmation not a dialog. Both docx rebuilt; README links unchanged. |
| 2026-10-01 | H1 | done | (this commit) | `formatPrice(price, locale)` in `src/lib/utils.ts` no longer defaults to `it`: `locale` is required, so the compiler finds every caller; every caller (customer, provider, admin, drawer, profile, VIP, referral, venue, booking confirm/PriceBreakdown/BookingCard/ServiceCard) now pass `locale` from `useI18n()` (SideDrawer's `useMemo` gets `locale` as a dependency). Provider dashboard "This Month's Earnings" uses `formatPrice` (was `€${…toLocaleString()}`); admin metrics GMV uses a whole-euro `Intl` currency format (was `${…} €`). New locale helpers in `utils.ts` (unit-tested): `formatDistance(km, locale)` (rewritten; was unused), `formatDecimal`, `euroSymbolPosition`. Distances on `/booking` results, `/fit/gyms` and the VLife route screens use them (it `0,1 km`, en `0.1 km`). Earnings withdraw field: `€` sits before the amount in en and after it in it/es/fr/de, placeholder `0,00`/`0.00`. it `notifications.subtitle` → "Centro notifiche per prenotazioni, chat e aggiornamenti dell'account." (es/fr/de already translated). No backend change, so no functions deploy needed. Verified locally against staging in fresh Playwright contexts at 390×844 (dark), language switched with the drawer's language picker: demo.customer /booking Near me it "Da 50,00 €" + "0,1 km" / en "From €50.00" + "0.1 km", profile wallet `0,00 €`/`€0.00`; demo.provider dashboard earnings card `0,00 €`/`€0.00`, bookings `50,00 €`/`€50.00`, earnings page + chart axis, withdraw dialog placeholder and € side as above. Both accounts set back to Italian, their original language (the language is stored on the account: a switch in one session follows the login). Open, not in H1: `formatDate` in `utils.ts` is hard-coded `it-IT`; ratings use `toFixed(1)` ("4.8" in it); the unused `FeatureCard` prints `price.toFixed(0)`; the withdraw input stays `type="number"`, so the decimal separator it accepts follows the browser, not the app language. |
| 2026-10-01 | H2 | done | (this commit) | `BookingRescheduleClient.tsx` now passes `bookableDays` / `isCheckingDays` / `onMonthChange` to `AvailabilityPicker` exactly like `BookingClient.tsx` (F1). `useBookableDays` takes an optional `excludeBookingId` (also part of the query key), so the day check asks getProviderSlots the same question as the reschedule slot list (which already excludes the booking being moved) and the booking's own slot stays bookable. Enabled only while the booking is reschedulable and signed in. No backend change, so no functions deploy needed. Verified locally against staging in a fresh Playwright context at 390×844 (dark, it) as demo.customer, My bookings → Fri 2 Oct 12:00 with demo.provider → detail → Riprogramma, nothing submitted: Oct 2026 weekends + today (Thu 1, inside 24 h) disabled, Fri 2 (the booking's own day) enabled; all 21 enabled days list ≥1 time (2 Oct: 2, 9 Oct: 10, others 15); every getProviderSlots call carried `excludeBookingId`. |
| 2026-10-01 | H3 | done | (this commit) | Backdrop click: the handler sat on the wrapper and checked `target === currentTarget`, but the absolute backdrop layer covers the wrapper, so the click never matched — `Modal` now closes from the backdrop layer's own `onClick`, with a `closeOnBackdrop` opt-out (default true; Esc unaffected). Edit/Add service pass `closeOnBackdrop={!…isPending}` so a save in flight can't lose its dialog; TrainingTab and RecipeGenerateModal already ignore close while generating. New `returnFocusRef` prop: Edit service records the card's menu button when its menu item is clicked (the item unmounts with the menu), and focus goes back there on close. Schedule page: both dialogs pass `className="w-full max-w-md"` (child `w-[calc…]` removed) and are labelled by their titles (`useId`). Customer booking detail cancel confirmation (`bookings/[id]/BookingDetailClient.tsx`) is now a `Modal` labelled by its title (was a plain fixed div + framer-motion): focus starts on Keep, Tab stays inside, Esc/backdrop close it. Also moved Modal's latest-`onClose` ref sync into an effect (`react-hooks/refs` lint error). Unit tests `Modal.test.tsx` +3 (backdrop closes / inside click doesn't, opt-out keeps Esc, `returnFocusRef`). No i18n keys, no backend change. Verified in fresh Playwright contexts at 390×844 (dark, it), nothing saved or cancelled: demo.provider schedule day dialog ("giovedì 15 ottobre") and Appuntamento dialog both 358px wide, 16px each side; Esc, backdrop and Chiudi close them; a click on the title keeps it open. Services: Edit dialog closes via Esc, backdrop and Annulla, focus back on the card's menu button each time; Add closes on backdrop, focus back on "Aggiungi servizio". demo.customer booking 9 Oct detail → Annulla prenotazione: `getByRole('dialog')` named "Annulla prenotazione", 358px centred, focus on Mantieni, Tab wraps, Esc/backdrop/Mantieni close it, focus returns to the opener, booking still pending. |
| 2026-10-01 | H4 | done | (this commit) | `/booking` result cards are now a Next `Link` to `/book?providerId=…` (store `selectProvider` still runs on click), with a focus ring; the list/map toggle buttons have `aria-label` (new keys `booking.page.viewList`/`viewMap`, 5 locales) + `aria-pressed`, icons `aria-hidden`. Payment switches: `role="switch"` + `aria-checked` (was `aria-pressed`); the same one-line change in `PilotFlagsSettings` and `ProviderOnboardingSettings`. A successful payment save shows the app toast `notify.success(admin.settings.savedSuccess)` (existing key); covered by new `PaymentSettingsPanel.test.tsx` (switch roles/state, toast on success, none on failure) — not saved live. Nested `<main>` → `div` in `home/page.tsx` and `profile/settings/{privacy,notifications}/page.tsx` (`page.vfun.test.tsx` now asserts no `main`; home tests stay at the 20 pre-existing failures). Map pop-up: new `src/components/map/markerInfoContent.ts` (unit-tested) builds the InfoWindow content as DOM with theme-token classes and `textContent` (names were interpolated into HTML before); `globals.css` themes the InfoWindow chrome (bubble, tail, close icon) and replaces Maps' inline `overflow: scroll` (white empty scrollbars) with `auto`. **Bug found and fixed here:** `GoogleMap` drew no markers on `/booking` and `/fit/gyms` — the marker effect ran before the async map existed and never re-ran; it now also depends on `isLoading`. Verified locally against staging in fresh Playwright contexts at 390×844 (it): demo.customer `/booking` toggles named "Vista elenco"/"Vista mappa" with `aria-pressed`, Tab from the search field reaches the first card (12 Tabs, ring visible), Enter opens `/book?providerId=…`; one `main` on home, privacy and notifications settings; Near me map shows the markers; `/fit/gyms` pop-up light (white bubble, dark text) → app toggle Scuro → dark live (#1E2230 bubble/tail, white text and close icon, Partner badge cyan) → Chiaro (badge sky-800), account theme back to its original `light`. Superadmin `/admin/settings`: 5 `switch` roles with `aria-checked`, Stripe toggled on/off in the form (mouse + Space), subscriptions disabled again, **nothing saved**, both payment switches still off. Open: on `/booking` and `/fit/gyms` a marker click navigates away at once, so the pop-up is barely seen there; several pop-ups can be open at once; `gyms` is rebuilt on every parent render, so the markers are redrawn (and an open pop-up closes) on any re-render; privacy settings "Back" button is hard-coded English. |
| 2026-10-01 | H5 | done | (this commit) | `formatDate(date, locale, options?)` in `src/lib/utils.ts` now takes a required app locale (was hard-coded `it-IT`), like `formatPrice`; all its callers (admin logs, roles, users list/detail/tabs, bookings list/detail, payments, provider tabs, verification queue, user types, service categories) pass `locale` from `useI18n()`. Every rating printed with `toFixed(1)` uses `formatDecimal(rating, locale, 1)` (it `4,8`, en `4.8`): `/booking` results, `/book`, provider profile + reviews, home, fit classes/home-training/virtual/gyms, profile, venue, assistant result cards, `ui/Rating` (text + aria-label), admin providers list/detail, VLife route screens, and the `GoogleMap` marker icons + pop-up (`markerInfoContent` now takes the rating as formatted text). Privacy **and** notifications settings "Back" buttons use the new key `profile.settings.back` (5 locales; redundant `aria-label="Back"` dropped, chevron `aria-hidden`). Unit tests: `formatDate` + one-decimal `formatDecimal` in `utils.test.ts`, `markerInfoContent.test.ts`, `/providers/reviews` test now expects `4,0`. No backend change, so no functions deploy needed. Verified locally against staging in fresh Playwright contexts at 390×844 (dark): demo.customer (account language it) ratings on `/fit/gyms`, `/booking`, `/home`, `/book` read `4,9`/`0,0` in it and `4.9`/`0.0` in en (switched with the drawer's language select), privacy and notifications Back read "Indietro"/"Back"; customer set back to it. demo.admin (account language en) `/admin/users` dates read `9/30/2026` + `Sep 30, 11:41 PM` in en and `30/09/2026` + `30 set, 23:41` in it (the admin sidebar's language select, hidden at 390 so its value was set + change event fired); admin set back to en. Open, not in H5: other non-rating `toFixed(1)` numbers (admin metrics hours, earnings chart trend %) stay dot-decimal. |
| 2026-10-01 | H6 | done | (this commit) | Map (`src/components/map/GoogleMap.tsx`): a marker click now only opens its pop-up; the pop-up (`markerInfoContent`, new optional `link`) ends with a real `<a href>` (44px, section gradient) whose plain clicks go through `onGymSelect` for in-app navigation (modified clicks left to the browser). `Gym` gains `href`, `GoogleMap` gains `linkLabel` (default new key `map.google.viewDetails`, 5 locales): `/booking` links to `/book?providerId=…` labelled "Verifica disponibilità" (`booking.provider.checkAvailability`), `/fit/gyms` to `/venue?id=…`; the booking-detail map passes no href, so no link. One shared `InfoWindow` per map, so opening a pop-up closes the previous one. Markers are kept in a `Map` by id and updated in place (position/title/icon), removed only when their id disappears; the open pop-up is rebuilt only when its data/locale changes and closes if its marker goes; `fitBounds` only when the set of ids changes; `onGymSelect` read via ref; the map instance is state, so markers are redrawn on a map re-created for a new `userLocation` (and a load finishing after unmount is ignored). Dead `markerDiv` innerHTML removed. Cancel dialog (`bookings/[id]/BookingDetailClient.tsx`): `Modal` has a new `describedBy` prop (`aria-describedby`); the dialog is described by its body text (+ the late-cancellation warning when shown); while the request is in flight the confirm button is disabled + `aria-busy` with a spinner and "Annullamento…" (new key `bookings.detail.cancelModal.cancelling`, 5 locales), Keep is disabled, and Esc/backdrop are ignored (`closeOnBackdrop={!isCancelling}` + guarded `onClose`); after a failure it can be closed again. Unit tests: new `BookingDetailClient.test.tsx` (describedby, pending state blocks Esc/backdrop and closes on success, closable after failure), `Modal.test.tsx` +1 (describedBy), `markerInfoContent.test.ts` +2 (link). No backend change, so no functions deploy needed. Verified locally against staging in a fresh Playwright context at 390×844 (it, account theme light) as demo.customer: `/booking` Near me → map: 48 markers, a click on Luca Bianchi opens his pop-up without navigating, a click on Anna Rinaldi swaps it (1 pop-up open); opening/closing the filter panel (parent re-render) created/removed 0 markers (constructor + `setMap(null)` probe), pop-up stayed open; its "Verifica disponibilità" link (`/book?providerId=demo-trainer-yoga-01`) opened Anna Rinaldi's page client-side (no reload). `/fit/gyms` map: a real mouse click on Body Center Milano opened its pop-up, Urban Core Gym Bari → Olympic Gym Roma kept 1 pop-up, "Vedi dettagli" opened `/venue?id=demo-venue-roma-gym-4`. Booking 9 Oct detail → Annulla prenotazione: dialog `aria-describedby` points at the body text, focus on Mantieni, Esc and Mantieni close it, **nothing cancelled** (still "In attesa di conferma"); the pending state is covered by the unit test only. Open: the pop-up link's dark-theme look was not viewed live (the account theme is light; the link uses the same gradient + white text in both themes). |
| 2026-10-01 | H5/H6 leftovers | done | (this commit) | Last non-locale numbers: admin metrics median hours and earnings-chart trend % → `formatDecimal`; refund dialog max → `formatPrice`. Kept on purpose: LocationEditor lat/lng stay dot-decimal (a comma decimal would be ambiguous inside "lat, lng"); `FeatureCard` `toFixed(0)` is unused code. |
