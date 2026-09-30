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
