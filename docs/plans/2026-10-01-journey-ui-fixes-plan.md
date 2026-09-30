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

### F3 `[ ]` Italian formatting & wording consistency (Medium)
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

### F4 `[ ]` Italian signup: back link under the language picker at 390px (Low)
"Indietro" / "Torna al login" overlaps the language picker on the Italian signup screens
(`src/app/auth/register/RegisterClient.tsx` and the auth layout header).
- **Done when:** no overlap at 320px and 390px in it and de (longest strings).

### F5 `[ ]` Overflow / squashed elements (Low–Medium)
- "AWAITING CONFIRMATION" badge overflows its card — customer booking detail
  (`src/app/(main)/bookings/[id]/BookingDetailClient.tsx`).
- "VERIFIED" badge clipped on search results with long names; "0.1 km" wraps awkwardly next to the price
  (search result card under `src/app/(main)/search` / `src/components/search`).
- Client avatar squashed into a narrow oval in provider bookings cards (`src/components/provider/BookingTable.tsx`
  mobile card) → `shrink-0` + fixed square.
- My bookings card chevron sits under the avatar (`src/app/(main)/bookings/…` list card).
- **Done when:** all five look right at 320px and 390px with a long name (use "Francesca Riva-Longobardi"-length data or devtools text edit).

### F6 `[ ]` Edit Service dialog (Medium, a11y)
Not centred on phones, labels not linked to inputs (`htmlFor`/`id`), not marked up as a dialog
(`role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap/escape). Find it under
`src/app/(main)/provider/services` / `src/components/provider` (grep `editService`). Prefer the shared
dialog primitive if one exists (`src/components/ui`).
- **Done when:** centred at 390px, Playwright `getByLabel` finds every field, `getByRole('dialog')` resolves, Esc closes.

### F7 `[ ]` Provider dashboard for a brand-new provider (Low)
- Greeting is "Welcome back! 👋" (`provider.dashboard.title`) even on first visit → "Welcome!" variant for a
  provider with no bookings yet (or first session), all 5 locales.
- "Recent Activity" (`provider.dashboard.activity.title`) stays empty after a booking request and a confirmation —
  find its data source (grep in `src/app/(main)/provider/page.tsx` / dashboard components); feed it from the
  provider's bookings (latest requested/confirmed/cancelled) or the provider notifications inbox.
- **Done when:** `journey.en.provider@vitfitdemo.dev` sees "Welcome!" + the Elena Gallo request/confirmation in Recent Activity.

### F8 `[ ]` Nested `<main>` landmarks on provider pages (Low, a11y)
`src/app/(main)/provider/layout.tsx:168` renders `<main>` inside `MainLayout`'s `<main>`
(`src/components/layout/MainLayout.tsx:66`) → make the inner one a `div`.
- **Done when:** provider pages have exactly one `main` landmark.

### F9 `[ ]` Map stays light in dark theme (Low)
`src/components/map/GoogleMap.tsx` (also `LocationEditor.tsx`): apply a dark map style (or a dark `mapId`)
when the resolved theme is dark; switch live on theme toggle.
- **Done when:** search map and location editor are dark in dark theme, light in light theme.

### G1 `[?]` Superadmin click-test of the payment switches (blocked on the user)
Payment switches shipped 2026-09-30 (`9f9af27`, staging + prod). Backend verified; the `/admin/settings`
"Payments & subscriptions" panel has not been clicked as a superadmin, since there's no staging superadmin
password on file (`admin@vfit.com`, uid `XTf3I7uzO1Ol2tN4vUIVeSld7HN2`).
**Ask the user** for the password or permission to reset it via the Auth Admin SDK. Then on staging: toggle
Stripe on → subscriptions toggle enables → save → `/vip` shows plans, drawer shows wallet → audit_logs entry
(`entityType: feature_flag`, `entityId: payments`) → **turn both back off** and verify.
Never flip the switches on **prod**. The user decides when to sell.

### G2 `[ ]` Refresh the affected guide screenshots (after F1–F9)
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
