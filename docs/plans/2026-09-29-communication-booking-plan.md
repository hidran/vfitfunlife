# VFit — Client ↔ Provider Communication & Booking Flow Plan

> **Created:** 2026-09-29 · **Baseline commit:** `543b720` (main)
> **Goal:** make the two sides of a booking actually hear from each other (notifications, push,
> chat), close the booking-flow gaps found in the 2026-09-29 audit, and keep a single place
> that says what is done and what is next.
> **Resume rule:** find the first task whose status is not `[x]`, read its "Done when", continue.
> Update the status box **and** the "Log" at the bottom in the same commit as the work.

Status legend: `[ ]` todo · `[~]` in progress (write who/when in the Log) · `[x]` done (commit hash) · `[-]` dropped (why).

---

## 0. How to work on this plan (read first)

**Environments** — staging `vfit-app-staging`, prod `vfit-funlife`. `.env.local` points at staging.
Prod builds **must** use `npm run build:prod`.

**Per task loop**
1. Branch check: `git branch --show-current` must be `main` (Codebuff shares this checkout — recheck
   before every commit; `git fetch && git log HEAD..origin/main` before prod deploys).
2. Implement + unit tests (vitest). Frontend: `npx vitest run <paths>`; functions: `cd functions && npx vitest run src`.
3. Gates: `npx tsc --noEmit -p .` (only known error: `src/lib/firebase/providers.test.ts:27`),
   `cd functions && npm run lint && npm run build`, i18n completeness test
   (`src/i18n/messages/completeness.test.ts` — every new key in **it, en, es, fr, de**).
   Full-suite baseline: **38 failing tests in 13 files are pre-existing** (functions emulator suites,
   `functions/src/users/{checkin,family,season0Rewards}`, `src/app/(main)/home/page*.test.tsx`).
4. Commit (end message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), then
   `gh auth switch --user hidran` and `git push origin main`.
5. Deploy **staging first**, in this order when relevant:
   - rules/indexes: `firebase deploy -P staging --only firestore,storage --non-interactive`, then wait
     until `gcloud firestore indexes composite list --project vfit-app-staging --format="csv[no-heading](state)"` is all READY;
   - functions: `firebase deploy -P staging --only functions --force --non-interactive`
     (retry on HTTP 429 quota errors after ~70s; `--force` is needed for retry-policy triggers;
     before deploying, confirm no deployed function would be deleted);
   - hosting: `npm run build:staging && firebase deploy -P staging --only hosting --non-interactive`,
     then `node scripts/check-bundle-budget.mjs`.
6. Smoke-test staging in a browser (Playwright). Demo accounts, password `VfitDemo!2026`:
   `demo.customer@vitfitdemo.dev`, `demo.provider@vitfitdemo.dev`, `demo.admin@vitfitdemo.dev`
   (admin is NOT superadmin). Demo clients: `npm run seed:demo-clients:staging` (re-run to reset
   after click-testing). HTML is served `no-cache` since 543b720, so a reload shows the new build.
7. Same deploy sequence on prod (`-P production`, `npm run build:prod`), then smoke-test prod.
8. Any data backfill: dry-run on staging → `--apply` → dry-run shows 0; on prod **ask the user
   before `--apply`** and show the dry-run counts.

---

## 1. Findings this plan is based on (2026-09-29 audit)

| Area | State | Evidence |
|---|---|---|
| Chat client↔trainer | Stub: hardcoded messages, local state only, no data model/rules | `src/app/(main)/chat/[id]/ChatClient.tsx:32-73` |
| "Messaggio" button (provider → client) | No `onClick` | `src/app/(main)/provider/clients/detail/ClientDetailClient.tsx:144-147` |
| Chat link from booking detail | Goes to `/chat/undefined` (`booking.providerId` never set; bookings use `instructorId`) | `src/app/(main)/bookings/[id]/BookingDetailClient.tsx:232`, `src/lib/firebookings.ts:263` |
| Client notifications UI | Mock data in localStorage; real `users/{uid}/notifications` never read | `src/stores/notificationStore.ts:15-48`, `src/app/(main)/notifications/page.tsx` |
| Provider notifications | UI reads `providers/{id}/notifications`, nothing writes there | `src/lib/firebase/provider.ts:665,735` |
| Push (FCM) | Server ready; client never gets/registers a token | `functions/src/notifications/index.ts:54,196`; `src/lib/firebase/functions.ts:447` (unused); `src/app/auth/permissions/page.tsx:82-99` |
| Email | Works only if secret `RESEND_API_KEY` is set (silently skipped otherwise) | `functions/src/lib/email.ts:85-96` |
| New booking → trainer | **No notification** on create | `functions/src/bookings/index.ts:238-428` |
| Client cancels → trainer | **No notification** | `functions/src/bookings/index.ts:542` |
| Trainer cancel reason | Frontend sends `reason`, callable reads `note` → dropped | `src/lib/firebase/provider.ts:408`, `functions/src/bookings/transitionCallables.ts:194` |
| Reminders | Push-only (never delivered), Italian only, uses `venueName` (null for trainer sessions) | `functions/src/scheduled/index.ts:44` |
| Client booking note | Always `''` | `src/app/(main)/booking/confirm/page.tsx:120` |
| Checkout | Mock cards (`:144`), UI-only 5% platform fee (`:77`) never charged; `pointsToUse` → boolean | `src/app/(main)/booking/confirm/page.tsx` |
| Reviews | UI fakes submit (setTimeout); server `submitReview` requires `completed` (not `payment_confirmed`) | `src/app/(main)/bookings/[id]/review/BookingReviewClient.tsx:59-78`, `functions/src/users/index.ts:392` |
| Provider client roster | Never created/updated from bookings | no writer of `clients` outside seed/AI |
| Stripe | Callables/webhook exist but unused by booking; webhook writes legacy `confirmed` | `functions/src/payments/index.ts:70,207,277,287` |
| Payment in practice | Off-platform: trainer records → client confirms/disputes → auto-confirm 48h | `functions/src/bookings/payments.ts:58,104`, `functions/src/scheduled/index.ts:264` |

Booking lifecycle (works): `requested → accepted|declined → completed|no_show → payment_confirmed`,
cancel/reschedule from active states; transaction re-checks slot + day lock (no double booking).
State machine: `functions/src/bookings/transitions.ts:22-44`; notifications on transitions:
`functions/src/bookings/notify.ts:36` (in-app + push + email, localized).

---

## 2. Tasks

### Phase A — Notifications that actually arrive (priority: P0)

- [x] (`8df2b6e`) **A1 — Notify trainer on new booking request.**
  In `createBooking` after the transaction commits, call the same notifier used by transitions
  (`notifyTransition` in `functions/src/bookings/notify.ts`, or a sibling `notifyNewRequest`) →
  trainer's `users/{instructorId}/notifications` + push + email, localized via
  `functions/src/notifications/bookingMessages.ts`. Must not fail the booking if notifying fails.
  *Done when:* unit test asserts one notification to the trainer with bookingId; staging: customer
  books demo.provider → trainer's inbox doc exists.

- [x] (`8df2b6e`) **A2 — Notify trainer when the client cancels** (legacy `cancelBooking`, `functions/src/bookings/index.ts:542`),
  including whether it was a late cancellation. *Done when:* test + staging check.

- [x] (`8df2b6e`, UI dialog in follow-up merge) **A3 — Fix trainer cancel reason** (`reason` vs `note`): accept both in
  `cancelBookingAsTrainer`, send `note` from `src/lib/firebase/provider.ts:408`. Reason appears in
  the client notification. *Done when:* test covers both names.

- [x] (`457bc19`) **A4 — Real notification inbox (client + provider).**
  Replace mock `src/stores/notificationStore.ts` with a TanStack query / `onSnapshot` on
  `users/{uid}/notifications` (orderBy createdAt desc, limit 50); unread badge in Header from the
  same source; wire `markNotificationRead` / `markAllNotificationsRead`
  (`src/lib/firebase/functions.ts:457,466`) or direct `updateDoc` of `isRead` (rules allow owner
  update — check `firestore.rules:236-240`). Provider pages (`provider.ts:665,735`) read the same
  `users/{uid}/notifications` path. Tap on a booking notification → booking detail
  (`/bookings/detail?id=` customer, `/provider/bookings/detail?id=` trainer — verify route names).
  Check field names written by functions (`title/body/type/data/isRead/createdAt`) and localize
  display. *Done when:* staging: actions from A1/A2 appear live in both inboxes; mark-read persists.

- [~] (`468954d`, code shipped; needs VAPID keys + iOS setup) **A5 — Register FCM tokens (web + native).**
  Web: after permission granted, `getToken(messaging, { vapidKey })` (needs
  `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in `.env`, `.env.staging`, `.env.local`; and
  `public/firebase-messaging-sw.js`) → `registerFcmToken`. Native: `@capacitor/push-notifications`
  `register()` + `registration` listener → `registerFcmToken` (check `registerFcmToken` shape in
  `functions/src/notifications/index.ts:196`). Refresh token on login; remove on logout.
  Keep firebase/messaging lazily loaded (bundle budget: `npm run check:bundle`).
  *Done when:* token stored on demo.customer on staging; a test push from
  `sendPushToUser` arrives in the browser. iOS/Android need a device build — note result in Log.

- [x] (`8df2b6e`) **A6 — Reminders fixed**: `sendBookingReminders` also writes in-app notification, localized
  (user `preferredLanguage`), uses service name / trainer name instead of `venueName` when null.
  *Done when:* unit test for trainer-session text; staging job run (or manual trigger) produces inbox entries.

- [~] **A7 — Email check**: confirm `RESEND_API_KEY` secret exists on staging and prod
  (`firebase functions:secrets:get RESEND_API_KEY -P <p>` — don't print the value). If missing, ask
  the user for a key; document in `docs/deployment/guide.md`. *Done when:* status recorded in Log.

### Phase B — Booking flow correctness (P1)

- [~] (`e10a958`, staging backfilled; prod pending) **B1 — Auto-maintain the provider's client roster.** On booking create / status change
  (trigger `onDocumentWritten('bookings/{id}')` or inside callables), upsert
  `clients/{instructorId}_{userId}` (decide id scheme; migrate/merge the existing seeded
  `demo-client-*` ids or leave them) with `providerId,userId,name,email,phone,firstVisit,lastVisit,
  totalBookings,totalSpent` (spent = sum of `payment_confirmed` finalPrice). Idempotent; backfill
  script `scripts/backfill-client-roster.mjs` (dry-run default). Needs index? (`clients`
  providerId+lastVisit exists). *Done when:* customer booking on staging makes the client appear in
  `/provider/clients`; backfill staging applied; prod dry-run counts shown to user.

- [x] (`2f02ff4`) **B2 — Client booking note**: send the note from `booking/confirm/page.tsx:120` (add a
  textarea, max ~500 chars, i18n), show it on the trainer's booking detail.

- [ ] **B3 — Honest checkout**: remove the UI-only 5% platform fee and mock saved cards from
  `booking/confirm/page.tsx` (show "Pagamento al trainer" / pay-in-person explanation); make
  `pointsToUse` semantics match the server (toggle "use my points"). Price shown must equal the
  server's `finalPrice` (add a test around the price breakdown). **Decision needed from user
  (see D1) before adding any card payment.**

- [x] (`2f02ff4`) **B4 — Reviews that save**: `BookingReviewClient.tsx` calls `submitReview`; server accepts
  `completed` **and** `payment_confirmed`; one review per booking; show on
  `/providers/reviews?id=`. Check rules and the rating aggregation on the instructor doc.

- [ ] **B5 — Stripe webhook status**: make `stripeWebhook` stop writing legacy `confirmed`
  (map to current state machine or leave booking status untouched) — only if Stripe stays (D1).

### Phase C — Chat (P1, larger)

- [x] (`69966bf`) **C1 — Data model + rules.** `conversations/{id}` with `participantIds: [a,b]` (sorted),
  `participants` map (name/photo), `lastMessage`, `lastMessageAt`, `unread: {uid: n}`, optional
  `bookingId`; messages in `conversations/{id}/messages` (`senderId,text,createdAt`, max 2000
  chars). Deterministic id `${minUid}_${maxUid}` so "Message" never duplicates. Rules: only
  participants read/write; sender must be auth uid; no edits to others' messages. Index:
  `conversations` participantIds array-contains + lastMessageAt desc. Rules unit tests in
  `functions/test/*-rules.test.ts` style (need emulator).
- [x] (`69966bf`) **C2 — Chat UI.** Static-export-safe routes: `/chat` (list) and `/chat/detail?id=` (thread),
  `onSnapshot` realtime, optimistic send, i18n (5 locales), mobile-first, a11y. Delete the stub
  `src/app/(main)/chat/[id]/` (+ redirect old links like the provider-legacy page did if needed).
- [x] (`69966bf`) **C3 — Entry points**: "Messaggio" on provider client detail, chat button on customer booking
  detail (use `instructorId`), provider public profile. Helper `chatHref(otherUid)` in `src/lib/routes.ts`.
- [x] (`69966bf`) **C4 — New-message notification**: trigger on message create → in-app + push to the other
  participant (throttle: max 1 push per conversation per ~5 min).

### Phase D — Decisions for the user (ask, don't assume)

- [ ] **D1** Payments: keep off-platform "trainer records payment" or take payment via Stripe?
- [ ] **D2** Keep `createPaymentIntent` and `checkIn` warm (minInstances 1 in prod, ~€2/month each)?
- [ ] **D3** Service worker / offline strategy (also required for web push background delivery → A5 needs at least `firebase-messaging-sw.js`).
- [ ] **D4** 70 prod instructors have no coordinates → invisible in "near me". Data task for ops.
- [ ] **D5** Hide demo accounts from prod stats/metrics? (15 demo bookings seeded on prod 2026-09-29.)

### Phase E — Carry-overs from the performance plan (lower priority)

- [ ] **E1** Firestore SDK still eager on every route (~352 KB): make ThemeContext/auth profile
  tolerate a lazily resolved Firestore (see `docs/performance/baseline.md`).
- [ ] **E2** Client-detail tabs (Goals/Training/Recipes) have no browser e2e test — add Playwright
  spec using the seeded demo clients.
- [ ] **E3** System-logs admin page paging verified only by unit tests (needs a superadmin account on staging).

---

## 3. Suggested order

A1 → A2 → A3 → A4 → A5 → A6 → A7 → B1 → B2 → B4 → (ask D1) → B3/B5 → C1 → C2 → C3 → C4 → E*.
A1–A4 can ship together (one staging+prod deploy). A5 needs the VAPID key (Firebase console →
Project settings → Cloud Messaging → Web Push certificates) for **both** projects — ask the user if
it isn't in the env files.

---

## 4. Log (append; newest last)

| Date | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 2026-09-29 | plan | created | — | Based on audit of booking/communication flows; demo clients seeded on staging + prod. |
| 2026-09-29 | A1,A2,A6 | done | 8df2b6e, f15969d | Trainer notified on new request + client cancel (late flag); reminders write localized in-app docs; notifications carry role-aware `link`. Staging verified: request + cancel notifications arrive in inbox. Late-cancel wording not exercised on staging. |
| 2026-09-29 | A3 | in progress | 8df2b6e | Server accepts `note`+`reason` (frontend wrapper already mapped reason→note). Provider UI had no reason input (window.confirm) — reason dialog being added. |
| 2026-09-29 | A4 | done | 457bc19 | Live inbox via onSnapshot; mark-read direct updateDoc; staging verified (badge, tap → /provider/bookings/detail, read persists). |
| 2026-09-29 | A5 | code shipped | 468954d | No VAPID key in env files → web push no-op until `NEXT_PUBLIC_FIREBASE_VAPID_KEY` added (staging: .env.staging+.env.local; prod: .env). Android needs google-services.json; iOS needs Firebase Messaging pod + AppDelegate + APNs key (device build). New callable `unregisterFcmToken`. |
| 2026-09-29 | A7 | status | — | RESEND_API_KEY: prod looks real (`re_…`); **staging holds a placeholder** → emails skipped on staging. Awaiting user decision. |
| 2026-09-29 | B1 | staging done | e10a958 | Trigger `syncClientRosterOnBookingWrite`; ids: existing (providerId,userId) doc updated in place, else `{instructorId}_{userId}`. Staging backfill: 1 create + 7 updates applied, re-dry-run 0. totalBookings counts all statuses (incl. cancelled). Prod dry-run pending. |
| 2026-09-29 | B2,B4 | done | 2f02ff4 | Note textarea + server sanitize; review route moved to `/bookings/review?id=`, real submitReview (completed+payment_confirmed, one per booking, transactional); review writes server-only in rules. Staging verified. Mobile submit bar overlapped by bottom nav → fix in progress. |
| 2026-09-29 | C1–C4 | done | 69966bf | conversations/{minUid_maxUid}, rules (customer↔customer blocked), server-side unread, push+in-app throttled 5 min. Deployed to staging. |
| 2026-09-29 | D1 | asked | — | User didn't answer yet → B3/B5 on hold. |
| 2026-09-29 | fixes | done | (this commit + merges) | From staging smoke test: /book now populates booking store (profile → confirm no longer dead-ends); trainer cancel reason dialog (A3 UI); review + reschedule submit bars above bottom nav; trainer name on reviews page; "request sent" banner only while `requested`; accessible terms checkbox; translated payment status/type labels. |
