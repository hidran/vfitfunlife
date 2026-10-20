# Unified Group Courses Implementation Plan (P2)

## P1 reconciliation notes (added 2026-10-19; read before any task)

This plan was written against main's own rebuild of business accounts. P1 was then **reconciled**: the production-deployed branch
`feat/business-accounts` is the base and main's delta was ported onto `reconcile/business-accounts` (analysis:
`docs/reports/2026-10-19-business-reconciliation-analysis.md`; plan log: `docs/plans/2026-10-04-business-accounts-plan.md`, entry
"Reconciliation 2026-10-19", task B12). What changed for P2 authors, all verified against the reconciled tree:

- **Business base.** The business code is the branch's: `functions/src/providers/{applyAsProvider,commitDecision,businessApplication,businessAdmin,businessAdminRules,businessVenue,syncBusinessVenueLocation}.ts`. Main's `businessVatClaim.ts`, `releaseBusinessVat.ts` (as a separate file), `validateBusinessApplication` and `providerDecisionError*` no longer exist.
- **`releaseBusinessVat({ vatNumber, reason? })`**, not `{ providerId }`; it returns `{ success, vatNumber, releasedFrom }` (`functions/src/providers/businessAdmin.ts`). Companion admin callables: `convertBusinessToIndividual`, `updateBusinessTaxId`.
- **`providerKind`, not `providerType`,** is the derived admin filter field on `users` (`functions/src/users/adminIndex.ts`, `src/lib/admin/adminIndex.ts`; four `users` indexes with `providerKind`, already on production). `users.providerType` still exists (`'individual' | 'business'`, server-written) but nothing filters on it. `scripts/backfill-provider-type.mjs` was deleted: use `scripts/backfill-search-tokens.mjs` (fills `providerKind`) and `scripts/backfill-provider-search.mjs`.
- **`safeHttpUrl`** lives in `src/lib/publicBusiness.ts` (not `businessDetails.ts`); `socialLinkHref` in `src/lib/socialLinks.ts` imports it.
- **Business types** (`BusinessDetails`, `ProviderType`, `BusinessLegalForm`, `BusinessVenueType`) are in `functions/src/providers/businessTypes.ts`; the web counterparts are in `src/types/firebase.ts`.
- **Venue ids** for companies are `biz_<uid>` (`businessVenueId()` in `functions/src/providers/businessVenue.ts`), created with `tx.create` **inside the approval transaction** of `commitProviderDecision`, with `ownerId = uid`, `partnerStatus: 'pending'`, `isPartner: false`, `isActive: true`. The owner link is the nested `instructors/{uid}.business.venueId`. Rejection / conversion to individual / deletion of the owner (the company's own `biz_<uid>` only) **deactivate** it (`isActive: false`, `deactivatedBy: 'lifecycle'`, `ownerId` kept); a later approval reactivates only a venue carrying that marker (an admin's manual switch-off stays off). A company that signed up without a venue type (absent = `none`) has no venue.
- **`hostsCourses(type)` and `COURSE_VENUE_TYPES`** (`gym | school | studio`) are in `src/types/venue.ts` and `functions/src/types.ts` (with `BUSINESS_VENUE_TYPES` = those plus `none`); `activePartnerGym` in `firestore.rules` repeats the list and a test pins them together.
- **Venue field is `ownerId`** (never `ownerUid`); `/admin/venues` Owner column links to `/admin/providers/?id=<ownerId>`.
- **New errors** a P2 client may see from the business callables: `venue_exists`, `business_address_required`, `business_city_required`, `invalid_venue_type`, `invalid_business_address`, `provider_type_locked`, `stale_review`, `review_required`, `claim_missing`, `claim_in_use` (full list in `docs/backend/cloud-functions.md`).
- **Deployment state.** Production runs the branch tree of 2026-10-06 and has **never** run the courses / partner-gym stack (9 more indexes, about 40 callables); staging runs main's old build until the reconciled commit is redeployed. Whether the reconciled business release ships courses to production first is an open owner decision (runbook: `docs/deployment/staging.md`, "Reconciled business release"). Task L8 step 1 ("expected empty") is only true if that release did **not** include the gym functions; if it did, take the two-deploy path described there.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. One fresh implementer subagent per task, then two-stage review (spec compliance, then code quality) before the task is ticked. Steps use checkbox (`- [ ]`) syntax. Work on `main`, one commit per task (review-fix commits allowed), stage only the files the task lists.

**Goal:** One group-class model for individual providers, gyms, schools and studios: a course (template) generates lessons, customers book a lesson or the whole course, venue staff manage rooms, instructors, substitutions, partner discounts, a waitlist and no-shows, and the separate partner-gym timetable flow is removed.

**Architecture:** The existing course engine (`functions/src/courses/*`) stays the single booking authority. Venue linkage, room/instructor day locks, server-computed quotes, waitlist promotion and per-lesson `revision` are added to it as small modules (`authority.ts`, `locks.ts`, `pricing.ts`, `quote.ts`, `enrollTx.ts`, `waitlist.ts`) that every callable composes inside one Firestore transaction (no nested transactions). The frontend extends `CourseEditor`, `/provider/courses`, `CourseBooking` and `/courses?tab=bookings`, adds a public weekly venue timetable, and only then (last group) deletes the partner-gym backend, rules, indexes, UI and docs.

**Tech Stack:** Next.js 16 static export, React 19, TanStack Query, Tailwind v4, Firebase Functions v2 (Node 24, `europe-west1`), Firestore + rules emulator, Zod, date-fns-tz, Stripe Checkout (existing), Vitest, Playwright MCP.

**Spec:** ../specs/2026-10-19-unified-group-courses-design.md (authoritative; section numbers below are its numbers). Builds on `../specs/2026-10-06-group-courses-design.md`, `../plans/2026-10-06-group-courses.md` and `../../plans/2026-10-04-business-accounts-plan.md`.

## Global Constraints

- Staging (`vfit-app-staging`) first, smoke-tested, then prod (`vfit-funlife`). Every deploy command has an explicit `-P staging|production` and a rebuild; prod builds use `build:prod` (`.env.local` is staging). The unified flow is built and staging-verified FIRST; the gym-flow removal is the LAST task group (spec §6.6). Prod is deployed once, at the very end (Task L8), because prod has no gym data and the gym flow is not a rollback target there (L8 step 1 re-checks this and falls back to a two-step prod deploy if gym functions turn out to be live).
- Direct payment stays the default; Stripe/course checkout switches stay off unless already on. Escrow stays unavailable. Memberships, packs, credits, series waitlists, QR check-in, fees (spec §10) are out of scope.
- No nested transactions: anything that must run inside another transaction takes a `Transaction` and returns a closure or plan (Tasks A4, D4). All reads of a transaction precede its writes. Seat counters are written with `FieldValue.increment` so two writes to one session in one transaction compose.
- All money is integer cents. Venue-linked prices use the quote (§5.3); unlinked courses are quoted with 0% discount and behave as today (U3).
- Nested-flag rule: any `set(..., {merge:true})` on `instructors/{uid}` uses nested maps, never dotted keys (this plan writes none; keep it that way).
- Five locales (it source, en, es, fr, de) for every client string AND for every server notification template; `src/i18n/messages/completeness.test.ts` must stay green in every commit.
- Mobile first: 390x844, 44px targets, light and dark. Browser-verify every UI group with Playwright MCP, never build-only.
- Shared checkout: Codebuff also commits here. `git branch --show-current` must print `main` before every commit; `git fetch && git log HEAD..origin/main` before any deploy; never `git add -A`. A functions deploy ships the whole working tree: if foreign uncommitted `functions/` edits exist, deploy from a clean `git worktree` of the commit (symlink `functions/node_modules`). Push needs `gh auth switch --user hidran`.
- Test baseline: 50 pre-existing vitest failures in 17 files on main (2026-09-30). Stash-compare before blaming a change. Firestore MCP `query_collection` always hits prod; do not use it for verification (use scripts with `--project`).

## Review Focus (every task review checks the ones that apply)

1. Concurrent last seat: one customer admitted, the loser lands on the waitlist or gets `lesson_full`; waitlist promotion never double-seats and never exceeds capacity.
2. Partial series: a series purchase with any full/unavailable lesson creates no enrollment, no participant, no counter change.
3. Replay idempotency: repeated enroll / cancel / promote / join / webhook events change nothing the second time (ids derive from `sha256(uid:requestId)`; counters guarded).
4. DST: gap and ambiguous wall times fail validation (`invalid_local_time`, `ambiguous_local_time`) with the location's timezone; lock keys use UTC days and survive DST days and UTC midnight crossings.
5. Venue authority: owner vs active staff vs inactive staff vs stranger vs admin on every callable that touches an existing course; authority resolved once at callable entry; `providerId` on edit is the stored one.
6. `price_changed`: price OR revision mismatch between quote and confirm is detected inside the enrollment transaction; staff path skips the check but still gets the discount.
7. Lock invariant: a lock slot exists iff its course is published and its session is scheduled (future sessions); the oracle in `lockInvariant.testutil.ts` runs after every lifecycle test.
8. Rules: queries must be provable from their constraints (venueId / userId / listed equality), no `get()` on unconstrained fields.

## Context block (the controller pastes this into EVERY implementer prompt)

```
PROJECT: /Users/hidranarias/projects/vfit (branch main, shared with Codebuff: check `git branch --show-current` before commit, stage only your files).
SPEC: docs/superpowers/specs/2026-10-19-unified-group-courses-design.md (authoritative). PLAN: docs/superpowers/plans/2026-10-19-unified-courses.md - do ONLY your task; use the names in its "Interface registry" exactly.
ENGINE: functions/src/courses/{core,store,index,enrollment,operations,checkout,maintenance,notifications,participantInvitations,providerEligibility}.ts + integration.test.ts. Client: src/types/course.ts, src/lib/firebase/courses.ts, src/hooks/useCourses.ts, src/components/courses/*, src/app/(main)/courses, src/app/(main)/provider/courses.
ALREADY DELIVERED BY P1 (business-accounts B1-B12, do not redo): hostsCourses()/COURSE_VENUE_TYPES = gym|school|studio (functions/src/types.ts, src/types/venue.ts, pinned to the activePartnerGym rule); business venues venues/biz_<uid> with ownerId, partnerStatus 'pending', school/studio VenueType; /fit/gyms lists gym+school+studio; safeHttpUrl; syncBusinessVenueLocation trigger. Venue fields: ownerId, partnerStatus ('pending'|'active'|'suspended'), isActive, memberDiscountPercent, partnerInstructorExtraPercent; venues/{v}/locations/{l}(+rooms), venues/{v}/instructors/{i}, venueStaff/{uid}={venueId,isActive}, instructors/{i}.partnerStatus.
RULES OF THE ROAD: test first (see failure, then pass); no nested transactions, all tx reads before writes; counters via FieldValue.increment; money in integer cents; every client string in it,en,es,fr,de (completeness test); error codes are HttpsError messages (see registry); no dotted keys in merge-sets; comments only where the why is not obvious.
RUNNERS: pure/unit: `cd functions && npx vitest run <file>`. Emulator (integration + rules; run OUTSIDE the sandbox, it binds ports): `cd functions && npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run <paths>"`. Web: `npx vitest run <paths>`; types: `npx tsc --noEmit -p .`; functions gate: `cd functions && npx tsc --noEmit && npm run lint`. Baseline: 50 pre-existing web vitest failures in 17 files - stash-compare before blaming your change.
COMMIT: `git add <exactly the files your task lists>` then `git commit` with the task's message, ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never `git add -A`; do not edit docs/plans/2026-10-04-business-accounts-plan.md (the controller logs P1 there).
REPORT BACK: files changed, commands run with the pass/fail counts, any deviation from the task text and why. Do not push or deploy unless your task is a deploy task (F5, F6, K1-K3, L7, L8).
```

## Interface registry (names are fixed; later tasks use them verbatim)

**Callables** (all `onCall({ region })`, exported from `functions/src/courses/index.ts` via `export *`):
`saveCourse`, `previewCourse` (now returns `conflicts`), `quoteCourse`, `enrollInCourse`, `enrollCourseParticipant` (now needs a `clients` pair and `canManageCourse`), `notifyCourseParticipant` (adds `courseId`), `cancelCourseEnrollment`, `recordCoursePayment`, `confirmCourseRefund`, `cancelRemainingCourse`, `joinCourseWaitlist`, `leaveCourseWaitlist`, `manageCourseSession`, `createCourseCheckout`, `courseStripeWebhook`. Kept and moved: `saveGymSpace`, `configureGymInstructor` (`functions/src/venues/spaces.ts`).

**`manageCourseSession` actions:** `attendance` (existing; `absent` sets `noShow`), `cancel`, `reschedule` ({startsAt, roomId?, reason}), `substitute` ({instructorId, reason?}), `removeParticipant` ({userId, reason?}), `removeWaitlistEntry` ({userId}), `capacity` ({capacity}).

**Error codes** (HttpsError message; `details` in brackets): `venue_authorization_required`, `venue_not_active`, `venue_owner_required`, `invalid_space`, `invalid_instructor`, `room_overlap` [{courseName,startsAt,endsAt}], `instructor_overlap` [same], `locked_schedule_too_long`, `price_changed` [{reason:'price'|'availability'}], `lesson_full` [{waitlistAvailable:boolean}] (replaces `session_full`), `already_waitlisted`, `waitlist_disabled`, `waitlist_full`, `waitlist_not_open`, `expected_price_required`.

**New/changed modules in `functions/src/courses/`:**
```ts
// authority.ts
export type Authority = { uid: string; via: "owner" | "venue" | "admin" };
export function managesVenue(uid: string, venueId: string, tx?: Transaction): Promise<boolean>;
export function canManageCourse(uid: string, course: Pick<Course,"providerId"|"venueId">, tx?: Transaction): Promise<Authority>; // throws permission-denied account_inactive | course_owner_required
// locks.ts
export type LockSlot = { id: string; courseName: string; venueId: string | null; locationId: string | null; roomId: string | null; instructorId: string | null; startsAt: Date; endsAt: Date };
export const MAX_LOCKED_SESSIONS = 400;
export function lockPaths(slot: LockSlot): string[]; // courseScheduleLocks/room_{v}_{l}_{r}_{UTCday}, instructor_{i}_{UTCday}
export function diffSlots(before: LockSlot[], after: LockSlot[]): { remove: LockSlot[]; add: LockSlot[] };
export function updateScheduleLocks(tx: Transaction, remove: LockSlot[], add: LockSlot[]): Promise<void>; // throws room_overlap|instructor_overlap
export function slotsOf(courseId: string, course: Pick<Course,"state"|"name">, sessions: {id: string; data: Session}[]): LockSlot[]; // [] unless course published; only scheduled sessions
// pricing.ts (pure)
export function discountPercents(venue: VenuePricing | null, instructorPartnerActive: boolean): { gymPercent: number; instructorPercent: number; percent: number };
export function applyDiscount(regularCents: number, percent: number): { regularCents: number; discountCents: number; finalCents: number };
export function quoteSeries(seriesCents: number, percents: number[]): { regularCents: number; discountCents: number; finalCents: number; allocations: number[]; discounts: number[] };
// quote.ts
export type SessionQuote = { sessionId: string; revision: number; regularCents: number; discountPercent: number; gymPercent: number; instructorPercent: number; discountCents: number; finalCents: number; availableSeats: number; waitlisted: number };
export type CourseQuote = { sessions: SessionQuote[]; series: null | { regularCents: number; discountPercent: number; gymPercent: number; instructorPercent: number; discountCents: number; finalCents: number; allocations: Record<string, number> } };
export function buildQuote(tx: Transaction | null, course: Course & { id: string }, sessionIds: string[]): Promise<CourseQuote>;
// enrollTx.ts
export type EnrollInput = { actor: string; uid: string; courseId: string; scope: "lesson" | "series"; sessionId?: string; paymentMode: "direct" | "stripe"; requestId: string; byProvider: boolean; expectedFinalCents?: number; expectedRevisions?: Record<string, number>; skipPriceCheck?: boolean; released?: Record<string, { occupied: number; held: number }>; promotedFromWaitlist?: boolean; checkoutOn: boolean };
export type EnrollResult = { enrollmentId: string; state: "held" | "confirmed"; totalCents: number; replay: boolean };
export function enrollInTx(tx: Transaction, input: EnrollInput): Promise<{ result: EnrollResult; commit: () => void }>; // all reads here, all writes in commit()
// waitlist.ts
export const WAITLIST_MAX = 100; export const PROMOTION_SCAN = 5; export const MAX_PROMOTION_SESSIONS_PER_TX = 25;
export type FreedSeat = { sessionId: string; kind: "occupied" | "held" | "free" }; // free = already free in the stored counters
export function planPromotions(tx: Transaction, args: { course: Course & { id: string }; sessions: Map<string, Session>; freed: FreedSeat[]; checkoutOn: boolean; now: Date }): Promise<{ apply: () => void; promoted: { sessionId: string; uid: string; enrollmentId: string }[]; cleared: string[] }>;
export function clearWaitlistInTx(tx: Transaction, course: Course & { id: string }, sessionId: string, reason: "lesson_cancelled" | "rescheduled" | "archived" | "window_closed"): Promise<() => void>; // read now, returns writer
export function promoteWaitlist(courseId: string, sessionId: string): Promise<number>; // loops single-seat transactions, returns promoted count
// operations.ts
export type ReleaseActor = { kind: "system" } | { kind: "customer"; uid: string } | { kind: "manager"; authority: Authority };
export function releaseEnrollment(enrollmentId: string, actor: ReleaseActor, selected?: string[], reason?: string, expired?: boolean, opts?: { markLate?: boolean }): Promise<void>;
```

**Documents** (spec §4, plus the resolutions below): `courses` + `locationId, roomId, instructorId, waitlistEnabled`; `sessions` + `revision, instructorId, instructorName, roomId, locationId, venueId, courseId, listed, waitlisted`; `sessions/{s}/waitlist/{uid}` = `{userId, customerName, scope:'lesson', requestId, paymentMode, position, createdAt, courseId, sessionId, courseName, providerId, venueId}`; `courseEnrollments` + `venueId, regularCents, discountCents, discountPercent, gymPercent, instructorPercent, sessionRevisions, promotedFromWaitlist`; `courseRefunds` + `courseId, venueId`; `participants` + `noShow` (the spec's `lateCancel` cannot live on a participant doc that release deletes: see R20); `courseEnrollments` also `lateCancelledSessionIds`; `courses/{id}/customers/{uid}` + `noShows, lateCancels` counters; `courseScheduleLocks/{key}` = `{slots: {[courseId_sessionId]: {start, end, courseName}}}`.

**Client** (`src/lib/firebase/courses.ts`): `quoteCourse(courseId, sessionIds)`, `joinCourseWaitlist(courseId, sessionId, paymentMode, requestId)`, `leaveCourseWaitlist(courseId, sessionId)`, `fetchVenueCourses(venueId)`, `fetchVenueEnrollments(venueId)`, `fetchVenueRefunds(venueId)`, `fetchWaitlist(courseId, sessionId)`, `fetchMyWaitlist(uid)`, `fetchVenueWeek(venueId, weekStart)`; hooks `useCourseQuote`, `useManagedVenueCourses` (the legacy `useVenueCourses` in `src/hooks/useVenues.ts` is a different thing and is removed in L3), `useVenueEnrollments`, `useVenueRefunds`, `useManagedVenues`, `useWaitlist`, `useMyWaitlist`, `useVenueWeek`, `useVenueNextLessons`, `useCustomerCounters`; `src/lib/courseErrors.ts` `courseErrorMessage(err, t)`.

## Spec gaps and ambiguities resolved here (all deviations are deliberate; the report lists them)

| # | Gap in the spec | Resolution |
|---|---|---|
| R1 | §5.9 wants a client collection-group query on `sessions(venueId,state,startsAt)` but no rule can read a session by its course's state without `get()` on an unconstrained field, and §5.8 has no sessions group rule. | Sessions carry `courseId` and `listed` (= course published AND provider eligible), written by `saveCourse`, kept in step by `onCourseProviderEligibility`. Rule `match /{path=**}/sessions/{sid}`: `listed == true && (venueId == null || activePartnerGym(venueId))`. Index becomes `sessions(venueId, listed, state, startsAt)` (COLLECTION_GROUP). The spec's instructor index is added as `(instructorId, listed, state, startsAt)`; this plan's UI filters by instructor client-side. |
| R2 | §4.4 (discount on the series total, then allocate) and §5.3 (allocate, then discount each allocation) differ by rounding. | §5.3 wins: allocate the series price with `allocatePrice`, `floor`-discount each allocation with that lesson's percent; `totalCents` = sum of final allocations; `allocations` stored post-discount; enrollment `discountPercent/gymPercent/instructorPercent` are informational (course-level instructor), the money fields are authoritative. |
| R3 | §5.5 says `nextAvailableSeats` is maintained on join/leave. | It tracks seats only (changes on enroll/release/promote); join/leave/promote/clear maintain the session `waitlisted` count. A promotion into a freed seat is net zero. |
| R4 | §6.2 has a waitlist "Remove" button but §5.6 has no action for it. | `manageCourseSession` action `removeWaitlistEntry`. |
| R5 | §4.3 `position` plus "next position". | Positions are kept contiguous: join = `waitlisted + 1`; leave/promote/remove renumber the rest in the same transaction. Waitlist is capped at `WAITLIST_MAX = 100` (`waitlist_full`). Waitlist docs also carry `courseId, sessionId, courseName, providerId, venueId` so the customer list needs no joins. |
| R6 | §8 names `lesson_full` but the engine throws `session_full`. | Renamed everywhere (core, tests, smoke scripts, client mapping); `details.waitlistAvailable` = lesson scope AND `waitlistEnabled` AND outside the notice window. |
| R7 | §4.8 says the "DST probe" moves into `locks.ts`; the probe lives inline in `generateSessions`, and locks key on UTC days. | `localInstant(day, hhmm, tz)` is extracted into `courses/core.ts` and reused by `generateSessions` (partnerGyms' copy is deleted in L1). `locks.ts` needs no probe; its tests cover UTC-midnight and DST-day slots. |
| R8 | §8 says overlap errors carry the conflicting course name and time; §4.6 slot values are `{start,end}` only. | Slot values also store `courseName` (no extra read after the first write). |
| R9 | Long annual courses would take thousands of lock writes in one transaction. | `MAX_LOCKED_SESSIONS = 400`: a course that takes any lock (venue room or instructor) and generates more sessions fails `locked_schedule_too_long`. Unlinked, instructor-less courses are unaffected (annual 365/366 stay valid). |
| R10 | A venue with no `ownerId` cannot receive on-behalf courses. | `venue_owner_required` when staff create on behalf of a venue without owner. |
| R11 | Stripe waitlist entry promoted after checkout was switched off. | The entry is skipped, deleted, and its user gets `waitlist_cleared`; the next entry is tried. Free (final 0) bookings always become `direct`, never `held`. |
| R12 | `saveCourse` resets every session to the course capacity, erasing per-lesson `capacity` actions. | Course capacity overwrites sessions only when the course capacity value changed; otherwise each session keeps its own. |
| R13 | "No per-participant authority re-checks" vs `releaseEnrollment(actorUid)` checking inside its transaction. | Authority is resolved once at callable entry (outside any transaction) and passed as `ReleaseActor`; a revoked-in-between staff member is an accepted sub-second race. |
| R14 | Refunds created before this change have no `courseId`. | `confirmCourseRefund` falls back to `courseEnrollments/{refund.enrollmentId}.courseId`. |
| R15 | Customer `enrollInCourse` without `expectedFinalCents`. | Rejected `expected_price_required`; the staff and promotion paths pass `skipPriceCheck`. |
| R16 | Promotion inside the release transaction has an unbounded read set. | `PROMOTION_SCAN = 5` candidates per freed seat, at most `MAX_PROMOTION_SESSIONS_PER_TX = 25` sessions per transaction; anything left is promoted by `promoteWaitlist` and by a maintenance sweep (`sessions` group query `state == scheduled`, `waitlisted > 0`, composite index added in F3). |
| R17 | Public venue query also needs `providerEligible` because the course read rule requires it. | `courses(venueId, state, providerEligible, nextStartsAt)` is added next to the spec's `courses(venueId, state, nextStartsAt)`. |
| R18 | Price/time edits of an unbooked session. | Any change of a session's `startsAt/endsAt/roomId/instructorId`, and any course-level price or capacity change, bumps `revision`. |
| R19 | Order vs the reconciled P1 release (browser re-verification and deploy of the business stack). | P2 prod deploy (L8) also ships anything of the reconciled business release not yet on prod (merged rules, `syncBusinessVenueLocation`, changed `commitProviderDecision`/`applyAsProvider`, the 9 courses/gym indexes); the `providerKind` indexes are already on prod; L8 step 1 checks. |
| R20 | §4.5 puts `lateCancel` on `participants/{uid}`, but a removed participant's doc is deleted by `releaseEnrollment` (membership must end). | Late removals are recorded on the enrollment (`lateCancelledSessionIds`) and counted per customer in `courses/{id}/customers/{uid}.lateCancels`; no-shows are `participants/{uid}.noShow` plus `customers/{uid}.noShows`. The roster reads the counters. |

## File map

Create (functions): `courses/{authority,locks,pricing,quote,enrollTx,waitlist}.ts` (+ `.test.ts` each), `courses/lockInvariant.testutil.ts`, `courses/waitlist.integration.test.ts`, `courses/venue.integration.test.ts`, `venues/spaces.ts` (+test), `test/unified-courses-rules.test.ts`, `notifications/bookingMessages.test.ts`.
Modify (functions): `courses/{core,store,index,enrollment,operations,checkout,maintenance,notifications,participantInvitations,providerEligibility,integration.test}.ts`, `notifications/bookingMessages.ts`, `index.ts`, `test/courses-rules.test.ts`.
Create (web): `src/lib/courseErrors.ts`, `src/hooks/useManagedVenues.ts`, `src/lib/firebase/venueSpaces.ts`, `src/types/venueSpaces.ts`, `src/components/venues/VenueSpacesPanel.tsx`, `src/components/courses/{InstructorPicker,ProviderCourses,VenueTimetable,TimetableCard,CourseQuoteReview,LessonWaitlist,SubstituteInstructor,LessonCapacity,MyWaitlist}.tsx` (+tests). Scripts: `scripts/{backfill-session-listed,smoke-unified-courses-staging,cleanup-gym-collections}.mjs`.
Modify (web): `src/types/course.ts`, `src/lib/firebase/courses.ts`, `src/hooks/useCourses.ts`, `src/components/courses/{CourseEditor,CourseBooking,CourseEnrollments}.tsx`, `src/app/(main)/courses/page.tsx`, `src/app/(main)/provider/courses/page.tsx`, `src/app/(main)/provider/layout.tsx`, `src/components/layout/DashboardModeSwitch.tsx`, `src/app/(main)/fit/gyms/timetable/page.tsx`, `src/app/(main)/venue/VenueDetailClient.tsx`, `src/components/admin/venues/{VenueDetailView,GymInstructorPanel}.tsx`, `src/i18n/messages/{it,en,es,fr,de}.ts`.
Delete (Group L only): `functions/src/partnerGyms/`, `functions/test/partner-gyms-rules.test.ts`, `src/components/gym/{GymManageClient,GymBookings,GymTimetableClient}.tsx`, `src/app/(main)/gym/`, `src/lib/firebase/gym.ts`, gym booking types in `src/types/gym.ts`, `docs/user-journeys/partner-gym-timetable.md`.

---

## Group A - Domain and authority

### Task 0: Preflight (no commit)

- [ ] **Step 1:** `git branch --show-current` prints `main`; `git status --short` shows only foreign edits (note them). Read the spec and the registry above.
- [ ] **Step 2: Baseline.** Run `cd functions && npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run src/courses src/partnerGyms test/courses-rules.test.ts test/partner-gyms-rules.test.ts"` (outside the sandbox) and `npx vitest run src/components/courses src/types`. Record pass counts in the Execution log at the bottom (commit that log line with the first task's commit).
- [ ] **Step 3:** `grep -rn "session_full" functions/src src scripts docs` and list the hits (they are renamed in A1).

### Task A1: Course schema, free prices, `localInstant`, `lesson_full`

**Spec:** §4.1, §2 U9, §8. **Files:** modify `functions/src/courses/core.ts`, `core.test.ts`, `integration.test.ts`, `scripts/smoke-group-courses-staging.mjs`, `src/types/course.ts` (types only).
**Creates:** `courseSchema` gains `locationId`, `roomId`, `instructorId` (`z.string().max(120).nullable().default(null)`), `waitlistEnabled: z.boolean().default(true)`; `money` minimum becomes 0; `export function localInstant(day: string, hhmm: string, timezone: string): Date`; `assertReservable` throws `lesson_full` (not `session_full`).

- [ ] **Step 1: Failing tests** in `core.test.ts`: (a) `validateCourse({...input, lessonPriceCents: 0, seriesPriceCents: 0})` succeeds, `-1` throws; `pricing_required` still thrown when both null; (b) defaults: `waitlistEnabled === true`, `locationId/roomId/instructorId === null`; (c) `localInstant("2026-03-29","02:30","Europe/Rome")` throws `invalid_local_time`, `("2026-10-25","02:30",...)` throws `ambiguous_local_time`, `("2026-10-12","18:00",...)` equals `2026-10-12T16:00:00.000Z`; (d) `assertReservable` over a full session throws `lesson_full`.
- [ ] **Step 2:** `cd functions && npx vitest run src/courses/core.test.ts` -> FAIL (`localInstant` is not exported / `session_full`).
- [ ] **Step 3: Implement.** Extract the wall-time block of `generateSessions` into `localInstant` (same probe offsets `[-7200000,-3600000,-1800000,1800000,3600000,7200000]`), call it from `generateSessions`; add schema fields; rename the error in `assertReservable`; `sed` the rename in `integration.test.ts` and `scripts/smoke-group-courses-staging.mjs`/`smoke-annual-courses-staging.mjs`/`smoke-course-participants-staging.mjs`; mirror the new draft fields in `src/types/course.ts` (`CourseDraft`: `locationId|roomId|instructorId: string | null`, `waitlistEnabled: boolean`).
- [ ] **Step 4:** `cd functions && npx vitest run src/courses/core.test.ts` -> all pass; `npx tsc --noEmit -p .` (root) still passes (CourseEditor initial draft gets the four new defaults in `emptyDraft()` here so types compile).
- [ ] **Step 5:** emulator run of `src/courses/integration.test.ts` -> same pass count as baseline.
- [ ] **Step 6: Commit** `feat(courses): venue/room/instructor fields, free prices, localInstant, lesson_full`.
**Done when:** the four assertions above pass and no `session_full` remains outside git history.

### Task A2: Store types and `authority.ts`

**Spec:** §5.1, U4. **Files:** create `functions/src/courses/authority.ts`, `authority.test.ts`; modify `store.ts`.
**Creates:** `Authority`, `managesVenue`, `canManageCourse` (registry). `store.ts` types: `Course` gains `venueId`, `locationId`, `roomId`, `instructorId`, `waitlistEnabled`; `Session` gains `revision?`, `instructorId?`, `instructorName?`, `roomId?`, `locationId?`, `venueId?`, `courseId?`, `listed?`, `waitlisted?`; `Enrollment` gains the §4.4 fields (all optional for legacy docs); new `WaitlistEntry`, `Participant` (`lateCancel?`, `noShow?`). `assertManager` is kept for now (removed in A6 once unused).

- [ ] **Step 1: Failing emulator test** (`authority.test.ts`, projectId `demo-vfit-authority`): seed `users/{owner,staff,inactiveStaff,admin,stranger,suspended}`, `venues/v {ownerId:'owner'}`, `venueStaff/staff {venueId:'v',isActive:true}`, `venueStaff/inactiveStaff {venueId:'v',isActive:false}`, `venueStaff/other {venueId:'w'}`. Assert `managesVenue`: owner/staff/admin true; inactiveStaff/other-venue staff/stranger false; missing venue false. `canManageCourse(uid, {providerId:'p', venueId:'v'})`: `p` -> via owner; staff -> via venue; admin -> via admin; stranger -> `course_owner_required` for venue-less, `course_owner_required` for venue course; suspended/deleted account -> `account_inactive`; works with and without `tx` (run once inside `db.runTransaction`).
- [ ] **Step 2:** emulator run -> FAIL (module missing).
- [ ] **Step 3: Implement** reading `users/{uid}`, `venues/{venueId}`, `venueStaff/{uid}` in parallel (tx-aware, same pattern as `partnerGyms/store.ts#assertGymManager`; user must be active; admin roles `admin|superadmin`; staff doc needs `venueId === venueId && isActive !== false`; do NOT require `hostsCourses` here - callers decide).
- [ ] **Step 4:** emulator run passes; `cd functions && npx tsc --noEmit && npm run lint`.
- [ ] **Step 5: Commit** `feat(courses): venue-aware course authority`.
**Done when:** every row of the matrix above is a test. **Review focus:** 5.

### Task A3: Lock helper `locks.ts`

**Spec:** §4.6, §4.8, §5.2 lifecycle, R7-R9. **Files:** create `functions/src/courses/locks.ts`, `locks.test.ts` (unit + emulator), `lockInvariant.testutil.ts`.
**Creates:** `LockSlot`, `MAX_LOCKED_SESSIONS`, `lockPaths`, `diffSlots`, `updateScheduleLocks`, `slotsOf` (registry). Adapted from `partnerGyms/store.ts#updateScheduleLocks` (read all day docs once with `tx.getAll`, apply removals first, then check each add against the remaining slots, write only changed docs). Collection `courseScheduleLocks`. Conflict error: `HttpsError("failed-precondition", "room_overlap" | "instructor_overlap", { courseName, startsAt: ISO, endsAt: ISO })` of the first conflicting slot. Room keys only when `venueId && locationId && roomId`; instructor keys whenever `instructorId`. `slotsOf` returns `[]` unless `course.state === "published"`, includes only `state === "scheduled"` sessions, uses the session's own `roomId/locationId/instructorId/venueId` snapshot.
`lockInvariant.testutil.ts` exports `assertLockInvariant(db)`: loads every course + sessions + all `courseScheduleLocks` docs and asserts the set of `slots` keys equals the set computed by `slotsOf` (only sessions starting in the future).

- [ ] **Step 1: Failing unit tests** (no emulator): `lockPaths` for a 18:00-19:00 UTC+2 slot gives one room + one instructor key; a slot 23:30-00:30 UTC gives two days each; a slot ending exactly 00:00 UTC gives only the first day; null room -> instructor key only; null instructor -> room key only; DST day (2026-10-25 02:00-03:00 Rome) keys use UTC days. `diffSlots` ignores identical slots, reports moved ones in both lists.
- [ ] **Step 2: Failing emulator tests:** two overlapping slots on the same room/day -> second `updateScheduleLocks` rejects `room_overlap` with `{courseName,startsAt,endsAt}` of the first; touching slots (end == start) allowed; same instructor in two rooms -> `instructor_overlap`; `remove` then `add` of the same id in one call never self-conflicts; removing frees the slot for another course; two concurrent transactions adding overlapping slots -> exactly one succeeds (Promise.allSettled).
- [ ] **Step 3:** run both -> FAIL. **Step 4: Implement.** **Step 5:** pass; functions gate.
- [ ] **Step 6: Commit** `feat(courses): room and instructor day locks`.
**Review focus:** 4, 7. **Done when:** concurrent test is stable over 10 repeated runs (`for i in 1..10`).

### Task A4: Extract `enrollInTx` (pure refactor)

**Spec:** §5.6 last bullet. **Files:** create `functions/src/courses/enrollTx.ts`; modify `enrollment.ts`.
**Creates:** `EnrollInput`, `EnrollResult`, `enrollInTx` (registry). Behaviour identical to today's `enroll()`: move the body of the transaction into `enrollInTx(tx, input)` which performs every read and returns `{ result, commit }`; `commit()` performs every write (enrollment `create`, roster `clients` create, `customers` set, course `nextAvailableSeats`, session counters, participants, notifications). Replay (`prior` exists) returns `{ result:{..., replay:true}, commit: () => {} }`. Counters switch to `FieldValue.increment` (session `held`/`occupied`, course `nextAvailableSeats`). `enroll()` in `enrollment.ts` keeps argument parsing/payment-mode checks and does `db.runTransaction(async tx => { const { result, commit } = await enrollInTx(tx, input); commit(); return result; })`. `released` (seat offsets) is accepted now and used in the capacity check (`occupied + held - released.occupied - released.held >= capacity` blocks); `skipPriceCheck`, `promotedFromWaitlist`, `expected*` are accepted but unused until C3/D4.

- [ ] **Step 1: Failing test** `enrollTx.test.ts` (emulator): calling `enrollInTx` directly inside two sequential transactions on a capacity-1 lesson - first `commit()` seats the customer, second throws `lesson_full`; calling it and NOT calling `commit()` writes nothing; replay returns `replay: true`; `released: {s1:{occupied:1,held:0}}` lets a customer in when the lesson is nominally full.
- [ ] **Step 2:** run -> FAIL. **Step 3:** implement. **Step 4:** emulator run of `enrollTx.test.ts` AND the full existing `integration.test.ts` -> baseline pass counts, no test edits other than imports.
- [ ] **Step 5: Commit** `refactor(courses): enrollInTx returns a commit closure`.
**Review focus:** 1, 2, 3 (existing concurrent last-seat and series atomicity tests must still pass unchanged).

### Task A5: Authority in the operations callables; `ReleaseActor`

**Spec:** §5.1. **Files:** modify `operations.ts`, `checkout.ts` (call sites), `maintenance.ts` (call sites), `integration.test.ts`; extend `authority.test.ts`.
**Changes:** `releaseEnrollment(enrollmentId, actor: ReleaseActor, selected?, reason?, expired?)`; customer path = `{kind:"customer", uid}`, system = `{kind:"system"}` (maintenance, webhook expiry, `cancelRemainingCourse` reconciliation), manager = `{kind:"manager", authority}`. A helper `releaseActorFor(uid, enrollment)` (exported from `operations.ts`) returns `customer` when `uid === enrollment.userId` else loads the course by `enrollment.courseId`, runs `canManageCourse`, returns `manager`. Callables: `cancelCourseEnrollment` (loads enrollment, `releaseActorFor`), `recordCoursePayment` and `confirmCourseRefund` (course via `courseId`; refund falls back to `courseEnrollments/{enrollmentId}.courseId`, R14), `manageCourseSession` and `cancelRemainingCourse` (course loaded once, `canManageCourse` once, the `Authority` passed into every `releaseEnrollment` loop iteration as `{kind:"manager", authority}`). `assertManager` is no longer used in `operations.ts`.

- [ ] **Step 1: Failing tests** (emulator, in `venue.integration.test.ts`, new file, fixture: provider `p` (verified), venue `v` owned by `p` OR by `biz`, staff `s`, inactive staff `si`, stranger `x`, admin `a`; course linked to `v` created by `p` directly through `db` writes): venue staff can `manageCourseSession cancel`, `cancelCourseEnrollment` (a customer's enrollment), `recordCoursePayment`, `confirmCourseRefund` (refund doc with `courseId`) and `cancelRemainingCourse`; inactive staff, other-venue staff and stranger each get `permission-denied` on each; owner `p` still works; admin works; a refund doc WITHOUT `courseId` resolves through its enrollment. A spy on `canManageCourse` (vi.spyOn on the module export) proves `manageCourseSession cancel` with 5 participants calls it exactly once.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** emulator: `venue.integration.test.ts` + `integration.test.ts` + `courses-rules.test.ts` pass.
- [ ] **Step 5: Commit** `feat(courses): venue staff authority for course operations`.
**Review focus:** 5 (no per-participant re-check; every callable that gets an enrollment/refund id loads the course).

### Task A6: `enrollCourseParticipant` and `notifyCourseParticipant` use course authority

**Spec:** §5.1 last paragraph. **Files:** modify `enrollTx.ts`, `enrollment.ts`, `participantInvitations.ts`, `integration.test.ts`, `src/lib/firebase/courses.ts` only if a wrapper exists (none today; the UI call sites change in G5).
**Changes:** in `enrollInTx`, `byProvider` calls `canManageCourse(actor, course, tx)` (throws `course_owner_required`) and requires the `clients` pair between `uid` and `course.providerId` (`provider_client_required`, unchanged code). `notifyCourseParticipant` takes `courseId`: loads the course, `canManageCourse(caller, course)`, uses `course.providerId` (not the caller) for `eligibleProvider`, `findRosterDoc(db, course.providerId, userId)`, the rate-limit key and the email "provider name"; the relation must exist (`provider_client_required`). Remove `assertManager` from `store.ts` when no references remain (`grep`).

- [ ] **Step 1: Failing tests:** staff `s` enrolls linked client `u` into the owner's venue course (`createdBy:'s'`, `paymentMode:'direct'`, `providerId:'p'`); without the `clients p_u` doc -> `provider_client_required`; stranger -> `course_owner_required`; `notifyCourseParticipant` as staff with `{courseId,userId,channel:'phone'}` returns `status:'ready'`; as stranger `permission-denied`; missing `courseId` -> `invalid_id`.
- [ ] **Step 2-4:** FAIL, implement, pass (emulator `integration.test.ts`, `venue.integration.test.ts`); update the two existing `notifyCourseParticipant` calls in tests/smoke scripts to pass `courseId`.
- [ ] **Step 5: Commit** `feat(courses): participant enrollment and invitations by course authority`.
**Review focus:** 5, 3.

### Task A7: Move `saveGymSpace` / `configureGymInstructor` to `venues/spaces.ts`

**Spec:** §4.7, §4.8. **Files:** create `functions/src/venues/spaces.ts`, `functions/src/venues/spaces.test.ts`; modify `functions/src/partnerGyms/schedule.ts` (delete the two callables and their now-unused imports), `functions/src/index.ts` (add `export * from "./venues/spaces";`).
**Behaviour:** same input schemas and outputs. `saveGymSpace` authority = `managesVenue(uid, venueId, tx)` AND `hostsCourses(venue.type)` (`gym_not_found` otherwise, `venue_authorization_required` for non-managers); `configureGymInstructor` unchanged (admin only, `hostsCourses` gate, verified instructor).

- [ ] **Step 1: Failing emulator tests:** owner and active staff create a location (IANA timezone validated; `Mars/Phobos` rejected) and a room; stranger and inactive staff get `venue_authorization_required`; room under a missing location -> `gym_location_not_found`; `spa` venue -> `gym_not_found`; admin can configure an instructor link, owner cannot; `partnerStatus` and the `venues/{v}/instructors/{i}` doc are written together.
- [ ] **Step 2-4:** FAIL, move/implement, pass; `cd functions && npx tsc --noEmit && npm run lint`; emulator `src/partnerGyms/integration.test.ts` still passes (it exercises the old callables via imports - update its import path for the two moved functions).
- [ ] **Step 5: Commit** `refactor(venues): spaces and instructor links leave partnerGyms`.
**Done when:** `grep -rn "saveGymSpace\|configureGymInstructor" functions/src` shows only `venues/spaces*`, `index.ts` and tests.

---

## Group B - `saveCourse` and `previewCourse`

### Task B1: providerId resolution, venue authority, publish gate

**Spec:** §5.1 (Edit, New course, Publishing), R10. **Files:** modify `functions/src/courses/index.ts` (`saveCourse`), `venue.integration.test.ts`.
**Behaviour:** on edit `providerId = old.providerId` (client value ignored) and `canManageCourse(uid, old, tx)`. On create: `providerId` = caller by default; if `venueId` set and caller `managesVenue` it and the client sent `providerId`/or none: `providerId = venue.ownerId` (`venue_owner_required` if missing); admins may pass any `providerId`; a non-admin passing a foreign `providerId` without venue authority -> `course_owner_required`. `venueId` must exist, `hostsCourses(type)`, and the caller must be allowed (`venue_authorization_required`); remove the dead `venues/{v}/staff/{providerId}` read. Publishing (`state === "published"`) a venue-linked course requires `venue.isActive !== false && venue.partnerStatus === "active"` else `venue_not_active`. `eligibleProvider(providerId)` applies to the resolved provider.

- [ ] **Step 1: Failing tests:** owner creates for own venue; staff creates with `providerId` omitted -> course `providerId` is the venue owner; staff edit of an owner-created course keeps `providerId`; stranger -> `venue_authorization_required`; individual provider with no venue unchanged; admin with explicit `providerId`; venue with no `ownerId` and staff caller -> `venue_owner_required`; publish at `partnerStatus:'pending'` -> `venue_not_active`, draft save allowed; `isActive:false` -> `venue_not_active`; a `spa` venue -> `venue_authorization_required`.
- [ ] **Step 2-4:** FAIL, implement, pass (`venue.integration.test.ts`, `integration.test.ts`).
- [ ] **Step 5: Commit** `feat(courses): saveCourse resolves provider and venue authority`.
**Review focus:** 5.

### Task B2: Space and instructor validation, forced timezone, display fields

**Spec:** §4.1 (timezone), §5.2 first bullet. **Files:** modify `index.ts` (`saveCourse`), `venue.integration.test.ts`.
**Behaviour (inside the transaction, before generating sessions):** when `venueId`: `locationId` and `roomId` required (`invalid_space`), location doc `venues/{v}/locations/{l}` active, room doc `.../rooms/{r}` active, else `invalid_space`. `input.timezone` is overwritten with `location.timezone || "Europe/Rome"`; `generateSessions` runs inside the transaction on the overwritten input (`validateCourse` still runs outside). `location` display text = `${room.name} · ${location.name}` and `city = location.city` (server-owned for venue courses). Without `venueId`, `locationId/roomId` are forced to `null`. `instructorId`: if set and venue-linked, `venues/{v}/instructors/{i}.isActive === true` AND `instructors/{i}` active+verified+not pending/rejected/suspended, else `invalid_instructor`; if set and unlinked, any such verified provider; then `input.instructor` is overwritten with the instructor's display name.

- [ ] **Step 1: Failing tests:** inactive room, room of another location, location of another venue, missing room -> `invalid_space`; timezone input `America/New_York` is stored as the location's `Europe/Rome`, and a location with `Asia/Tokyo` generates session instants in Tokyo; DST: a venue-linked weekly course on `2026-10-25` at 02:30 fails `ambiguous_local_time` in the location's timezone; unlinked instructor id of an unverified provider -> `invalid_instructor`; instructor not linked to the venue -> `invalid_instructor`; instructor name overwrites `instructor`; unlinked course ignores client `locationId/roomId`.
- [ ] **Step 2-4:** FAIL, implement, pass. **Step 5: Commit** `feat(courses): validate venue space and instructor, force venue timezone`.
**Review focus:** 4, 5.

### Task B3: Session snapshots, revision matrix, `listed`, freeze list, capacity

**Spec:** §4.1 (frozen), §4.2, §5.2 last bullet, R12, R18. **Files:** modify `core.ts` (+test), `index.ts`, `integration.test.ts`/`venue.integration.test.ts`.
**Creates (core.ts):** `export function courseRevisionBumped(prev: Pick<CourseInput,"lessonPriceCents"|"seriesPriceCents"|"capacity">, next: same): boolean` and `export function sessionRevisionBumped(prev: {startsAt: number; endsAt: number; roomId: string|null; instructorId: string|null}, next: same): boolean`.
**saveCourse writes** per session: `courseId`, `venueId`, `locationId`, `roomId`, `instructorId`, `instructorName`, `revision` (1 for new, `previous.revision ?? 1` + 1 when either function says so), `listed` (`input.state === "published" && provider eligible`), `waitlisted: previous?.waitlisted ?? 0`, `capacity` per R12. The frozen list (`booked_schedule_locked`) gains `venueId, locationId, roomId, instructorId`. Existing `hasBookings` logic and "keep prior startsAt when booked" stay.

- [ ] **Step 1: Failing tests (unit, core.test.ts)** - revision matrix table: lesson price change true; series price change true; capacity change true; name/description/level edit false; both null -> null false. Session matrix: time shift true, room change true, instructor change true, identical false.
- [ ] **Step 2: Failing integration tests:** new sessions have `revision:1`, snapshot fields, `courseId`, `listed:true` for published and `false` for draft; capacity edit 8 -> 10 bumps every scheduled session to 2; price edit bumps; a name-only edit does not; after a lesson-level `capacity` action (simulated by writing the session doc) a name-only `saveCourse` keeps that session's capacity, a course-capacity change overwrites it; editing `roomId` on a booked course -> `booked_schedule_locked`; editing `instructorId` on an unbooked course OK and bumps revision.
- [ ] **Step 3-5:** FAIL, implement, pass, commit `feat(courses): session snapshots, revision and listing flag`.
**Review focus:** 6 (revision bumps are what `price_changed` compares), 2.

### Task B4: Lock lifecycle in `saveCourse` + invariant oracle

**Spec:** §5.2 (locks + invariant), R9. **Files:** modify `index.ts`; `venue.integration.test.ts`; use `lockInvariant.testutil.ts`.
**Behaviour:** before any `tx.set`: `before = slotsOf(id, old, existingSessions)` (old state), `after = slotsOf(id, {...input, state}, newSessionDocs)` where new session docs are those about to be written; `await updateScheduleLocks(tx, ...diffSlots(before, after))`. Sessions removed by a schedule edit, an unpublish (`draft`), an archive (`archived`) release automatically because `after` omits them. If `after.length > MAX_LOCKED_SESSIONS` -> `locked_schedule_too_long` (details `{fields:["startDate","endDate"]}`). Conflict errors surface as `room_overlap` / `instructor_overlap` with details. Slot id is `${courseId}_${sessionId}`; `courseName = input.name`.

- [ ] **Step 1: Failing tests** (each ends with `await assertLockInvariant(db)`): publish takes room + instructor locks for every session; second course in the same room overlapping -> `room_overlap` with first course's name/start/end, and no sessions, course doc or locks of the failed course exist; same instructor in a different room -> `instructor_overlap`; adjacent times allowed; draft save takes no locks; publish -> draft releases; publish -> archived releases; schedule shortening removes the dropped sessions' slots; moving a weekly course by one hour re-keys cleanly; an unlinked course with `instructorId` set takes instructor locks only; unlinked + no instructor takes none; a 366-day daily venue course -> `locked_schedule_too_long`, a 366-day daily UNLINKED course (no instructor) still saves (annual regression); two concurrent `saveCourse` calls for overlapping slots -> exactly one succeeds.
- [ ] **Step 2-4:** FAIL, implement, pass (also run `integration.test.ts` annual tests). **Step 5: Commit** `feat(courses): room and instructor locks follow the course lifecycle`.
**Review focus:** 7, 4.

### Task B5: `previewCourse` conflicts

**Spec:** §6.1 last bullet. **Files:** modify `index.ts` (`previewCourse`), `venue.integration.test.ts`.
**Behaviour:** input also accepts `courseId?` (own edits ignore their own slots). Applies the same space validation/timezone override as B2 (read-only), generates sessions, builds slots with `slotsOf`, reads the lock docs with a plain `getAll` (no transaction) and returns `{ sessions:[{id,startsAt,endsAt}], conflicts:[{sessionId, kind:"room"|"instructor", courseName, startsAt, endsAt}] }`. Authority: signed-in; for a venue it requires `managesVenue` (else `venue_authorization_required`).

- [ ] **Step 1: Failing tests:** conflicts empty for a free slot; one conflict row naming the other course for an overlapping room; editing course A with its own id reports none against itself; stranger on a venue -> `venue_authorization_required`; unlinked preview unchanged (existing tests).
- [ ] **Step 2-4:** FAIL, implement, pass. **Step 5: Commit** `feat(courses): previewCourse reports lock conflicts`.
**Review focus:** 7 (preview is advisory; the transaction in `saveCourse` stays authoritative).

---

## Group C - Quote, discounts, `price_changed`, enrollment snapshot

### Task C1: `pricing.ts` (pure)

**Spec:** §5.3, U5, U9, R2. **Files:** create `functions/src/courses/pricing.ts`, `pricing.test.ts`.
**Creates:** `discountPercents`, `applyDiscount`, `quoteSeries` (registry). `VenuePricing = { memberDiscountPercent?: number; partnerInstructorExtraPercent?: number }`. Percent inputs are clamped to integers 0..100 (non-numbers -> 0); `percent = min(100, gym + instructor)`; instructor part only when `instructorPartnerActive`; `venue === null` -> all zero. `applyDiscount`: `discountCents = Math.floor(regular * percent / 100)`. `quoteSeries(seriesCents, percents)`: `allocations = allocatePrice(seriesCents, percents.length)` (from `core.ts`), per allocation `applyDiscount(a, percents[i])`, returns finals as `allocations` (post-discount), `discounts`, and sums.

- [ ] **Step 1: Failing tests:** 10% + 5% active of 1500 -> discount 225, final 1275; instructor not active -> 150; cap `95 + 10` -> 100% -> final 0; `0` regular -> all 0; `percent 33` of 100 -> floor 33; series 4000 over 3 lessons at 15% -> allocations `[1134,1134,1134]`, discounts `[200,199,199]`, final 3402, discount 598, regular 4000, and `sum(allocations) === finalCents`; per-lesson percents `[15,10,15]` use each lesson's own percent; invalid input (`-5`, `"x"`, `150`) clamps.
- [ ] **Step 2-4:** `cd functions && npx vitest run src/courses/pricing.test.ts` FAIL -> implement -> PASS. **Step 5: Commit** `feat(courses): partner discount maths`.

### Task C2: `quoteCourse`

**Spec:** §5.3. **Files:** create `functions/src/courses/quote.ts`, `quote.test.ts`; modify `index.ts` (`export * from "./quote"`).
**Creates:** `buildQuote`, callable `quoteCourse({courseId, sessionIds?})` (default = all sessions). Reads (transaction-aware, `tx` may be null): course, requested sessions, venue (if `course.venueId`), `instructors/{effectiveInstructorId}` per distinct instructor (`session.instructorId ?? course.instructorId`; none -> not active). `SessionQuote` per session when `lessonPriceCents !== null` (else `sessions: []`); `series` when `seriesPriceCents !== null`, computed with `quoteSeries` over `course.sessionIds` order and each session's percent; its `discountPercent/gymPercent/instructorPercent` use the COURSE-level instructor (R2). `availableSeats = max(0, capacity - occupied - held)`, `revision = session.revision ?? 1`, `waitlisted = session.waitlisted ?? 0`. Callable rules: signed-in (`unauthenticated`), course published+eligible unless the caller `canManageCourse` (`course_not_found`), venue course of an inactive partner -> `venue_not_active` for non-managers, `sessionIds` must belong to the course (`session_not_in_course`), max 100 ids per call.

- [ ] **Step 1: Failing emulator tests:** unlinked course -> percent 0, final = regular; venue 10 + active-partner instructor 5 -> 15%; non-partner instructor -> 10%; substituted session (override `instructorId`) uses that instructor's status; free lesson -> final 0; full session -> `availableSeats: 0` and `waitlisted` echoed; series quote equals the C1 example and its `allocations` sum to `finalCents`; unauthenticated -> error; draft course -> `course_not_found` for a stranger, quote for the owner; suspended venue -> `venue_not_active`.
- [ ] **Step 2-4:** FAIL, implement, PASS (emulator). **Step 5: Commit** `feat(courses): server-side course quotes`.
**Review focus:** 6.

### Task C3: Quote inside enrollment, `price_changed`, snapshot, free bookings

**Spec:** §5.4, R6, R11, R15. **Files:** modify `enrollTx.ts`, `enrollment.ts`, `checkout.ts` (guard), `integration.test.ts`, `venue.integration.test.ts`.
**Behaviour:** order inside `enrollInTx`: replay -> course/provider/user checks -> `assertReservable` (wrap: plain `lesson_full` becomes `HttpsError("failed-precondition","lesson_full",{waitlistAvailable})`, `waitlistAvailable = scope==="lesson" && course.waitlistEnabled !== false && session.startsAt > now + noticeHours`) -> venue-linked: `venue.isActive !== false && partnerStatus === "active"` else `venue_not_active` -> `buildQuote(tx, ...)` -> price check unless `skipPriceCheck`: missing `expectedFinalCents`/`expectedRevisions` -> `expected_price_required`; `finalCents` mismatch -> `HttpsError("failed-precondition","price_changed",{reason:"price"})`; any `expectedRevisions[id] !== (session.revision ?? 1)` -> `{reason:"availability"}`. `enrollCourseParticipant` sets `skipPriceCheck: true`. Writes: `totalCents` = quote final (series: sum), `allocations` post-discount, plus `venueId, regularCents, discountCents, discountPercent, gymPercent, instructorPercent, sessionRevisions, promotedFromWaitlist`. `totalCents === 0` -> `paymentMode: "direct"`, `state: "confirmed"`, `paymentStatus: "paid"`, `paidCents: 0`, `paymentMethod: "free"`, `paidAt` (even when `stripe` was requested; replay comparison skips the payment-mode check when `prior.totalCents === 0`). `createCourseCheckout` rejects `totalCents <= 0` with `checkout_hold_unavailable`. The roster `clients` write becomes `tx.set` (idempotent when two promotions of the same user share a transaction, Task D4).

- [ ] **Step 1: Failing tests** (update existing enrollment tests to pass `expectedFinalCents` from `quoteCourse`): price-changed on lesson price edit between quote and enroll -> `price_changed` `{reason:'price'}`, nothing written; capacity edit between quote and enroll -> `{reason:'availability'}`; same request retried after success -> replay (no `price_changed`); missing expected -> `expected_price_required`; discounted lesson stores `regularCents:1500,discountCents:225,discountPercent:15,gymPercent:10,instructorPercent:5,totalCents:1275`; discounted series stores post-discount `allocations` summing to `totalCents` and `sessionRevisions` for every lesson; staff-added participant (`enrollCourseParticipant`) gets the discount and skips the check; free lesson with `paymentMode:'stripe'` becomes `direct/paid/confirmed`; free series; full lesson -> `lesson_full` with `waitlistAvailable` true/false (series scope false, `waitlistEnabled:false` false, inside notice false); venue suspended after publish -> `venue_not_active`; partial series (one lesson full) still creates nothing.
- [ ] **Step 2-4:** FAIL, implement, PASS: emulator run of `integration.test.ts`, `venue.integration.test.ts`, `enrollTx.test.ts`. **Step 5: Commit** `feat(courses): priced enrollment with price_changed and discount snapshot`.
**Review focus:** 1, 2, 3, 6.

### Task C4: Refunds carry `courseId`/`venueId`; discounted refund maths

**Spec:** §4.4 last paragraph. **Files:** modify `operations.ts` (`releaseEnrollment` refund writes), `checkout.ts` (`${id}_late` refund), tests.
**Behaviour:** every `courseRefunds` doc gains `courseId` and `venueId` (`enrollment.venueId ?? null`). Refund amounts come from the stored (post-discount) `allocations`; free enrollments (`totalCents 0`) create no refund docs.

- [ ] **Step 1: Failing tests:** discounted series (C1 example, paid direct) - customer cancels lesson 2: one refund doc `amountCents 1134` with `courseId`, `venueId`, then cancelling the rest gives refunds summing to exactly `3402`; Stripe late refund doc carries both fields; free lesson cancel -> no refund doc; a venue staff user can read the refund through `fetchVenueRefunds`-style query by `venueId` (covered by the rules test in F1).
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(courses): refunds record course and venue`.

---

## Group D - Waitlist

### Task D1: Pure waitlist helpers and types

**Spec:** §5.5, R5. **Files:** create `functions/src/courses/waitlist.ts` (pure parts only), `waitlist.test.ts`.
**Creates:** constants (registry), `isFull(session, course)`, `promotionWindowOpen(session, course, now)` (`startsAt > now + bookingNoticeHours*3600000`), `joinDecision({course, session, now, hasParticipant, hasEntry, waitlisted}): null | "waitlist_disabled" | "waitlist_not_open" | "already_enrolled" | "already_waitlisted" | "waitlist_full"`, `renumber(entries: {id: string; position: number}[], removed: string[]): {id: string; position: number}[]` (contiguous from 1, order preserved).

- [ ] **Step 1: Failing unit tests** (table-driven): disabled course; session not scheduled; session not full; inside notice window; course `enrollmentClosed`/not published; already a participant; already waitlisted; `waitlisted >= WAITLIST_MAX`; the happy path returns `null`; window exactly at the boundary (`startsAt == now + notice`) is closed; `renumber([a1,b2,c3],["a"])` -> `[b1,c2]`; removing an unknown id is a no-op.
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(courses): waitlist rules as pure functions`.

### Task D2: Notification events and server catalog (5 locales)

**Spec:** §5.7. **Files:** modify `functions/src/notifications/bookingMessages.ts`, create `bookingMessages.test.ts`; modify `functions/src/courses/notifications.ts`.
**Behaviour:** `BookingMessageEvent` gains `waitlist_promoted`, `waitlist_cleared`, `instructor_changed`; `BOOKING_MESSAGES` (type-enforced) gets all three in `it, en, es, fr, de`. Copy (it): promoted `title "Posto liberato"`, body `Si è liberato un posto per {svc}{when}. Apri le tue prenotazioni per confermarlo; con pagamento online hai 30 minuti.`; cleared `title "Lista d'attesa chiusa"`, body `La lista d'attesa per {svc} è stata chiusa: la lezione è stata annullata, spostata o è troppo vicina.`; changed `title "Istruttore cambiato"`, body `L'istruttore di {svc}{when} è cambiato. Trovi i dettagli nell'app.` Other locales are natural translations (en: "A spot opened up", "Waitlist closed", "Instructor changed"). `queueCourseNotification`'s `course` argument gains `venueId?: string | null`; provider-side link becomes `/provider/courses?venue=${venueId}` when set, else `/provider/courses`; customers keep `/courses?tab=bookings`. Notification `type` stays `course`.

- [ ] **Step 1: Failing test** `bookingMessages.test.ts`: for each locale in `SUPPORTED_LOCALES` and each new event, `buildMessage(event, locale, {serviceName:"Yoga", startsAt})` returns non-empty `title`/`body` mentioning "Yoga"; locales differ from each other for the title; `queueCourseNotification` link test (unit with a fake tx collecting the `set` payload).
- [ ] **Step 2-4:** FAIL, implement, PASS (`cd functions && npx vitest run src/notifications/bookingMessages.test.ts`), `npx tsc --noEmit && npm run lint`. **Step 5: Commit** `feat(courses): waitlist and substitution notification events`.

### Task D3: `joinCourseWaitlist` / `leaveCourseWaitlist`

**Spec:** §5.5 first bullet. **Files:** modify `waitlist.ts` (callables), `index.ts` (export), create `waitlist.integration.test.ts` (first tests).
**Behaviour (join, one transaction):** reads course, session, `participants/{uid}`, `waitlist/{uid}`, `courseEnrollments/{sha256(uid:requestId)}`, user, venue (if linked), first `WAITLIST_MAX` entries only through the counter `session.waitlisted`; `joinDecision`; payment mode `stripe` requires `checkoutActive` (read settings before the transaction, same message as enroll); an existing entry with the same `requestId` returns it (replay), a different `requestId` -> `already_waitlisted`; an existing enrollment with that id -> `request_id_reused`; account/provider/self checks as enroll (`cannot_book_yourself`); venue course -> `venue_not_active`. Writes `waitlist/{uid}` per registry with `position = waitlisted + 1`, `createdAt` server time, and `session.waitlisted` increment(1). Leave: reads entries ordered by `position` (max `WAITLIST_MAX`), deletes the caller's, renumbers the later ones with `renumber`, increments `waitlisted` by -1; missing entry -> `{success:true}` no-op. Input: `courseId`, `sessionId`, `paymentMode` (`direct|stripe`), `requestId` (join), all `safeId`.

- [ ] **Step 1: Failing tests:** happy join -> doc + `waitlisted 1`, position 1; second customer position 2; replay same requestId returns same doc, counter still 1; new requestId -> `already_waitlisted`; seat free -> `waitlist_not_open`; `waitlistEnabled:false` -> `waitlist_disabled`; inside notice window -> `waitlist_not_open`; member of the lesson -> `already_enrolled`; provider joining own course -> `cannot_book_yourself`; stripe while checkout off -> `Online course payments are not enabled`; 101st join -> `waitlist_full` (seed counter); leave removes and renumbers `[1,2,3]` -> leaving 2 leaves `[1,2]`; leave twice is a no-op; two concurrent joins get positions 1 and 2 (never duplicates); `waitlisted` always equals the number of waitlist docs.
- [ ] **Step 2-4:** FAIL, implement, PASS (emulator). **Step 5: Commit** `feat(courses): join and leave a lesson waitlist`.
**Review focus:** 1, 3.

### Task D4: Promotion engine (`planPromotions`, `clearWaitlistInTx`)

**Spec:** §5.5 promotion, R11, R16. **Files:** modify `waitlist.ts`, `waitlist.integration.test.ts`.
**Creates:** `FreedSeat` becomes `{ sessionId; kind: "occupied" | "held" | "free" }` (`free` = the seat is already free in the stored counters; used by D6). `planPromotions` (registry) does ONLY reads and returns `apply()`:
1. Return an empty plan when `course.state !== "published"` or `course.enrollmentClosed`. Take at most `MAX_PROMOTION_SESSIONS_PER_TX` freed sessions whose stored `state === "scheduled"`.
2. Per session read the waitlist ordered by `position` (limit `WAITLIST_MAX`). Empty -> skip. `!promotionWindowOpen` -> the whole list is cleared (`cleared.push(sessionId)`, every user gets `waitlist_cleared`, `waitlisted` set to 0).
3. Otherwise try the first `PROMOTION_SCAN` entries in order: read `users/{uid}`; drop (delete + `waitlist_cleared` to that user) when the account is inactive, the entry is `stripe` while `!checkoutOn`, or `enrollInTx` throws `account_inactive | cannot_book_yourself | already_enrolled`; stop silently on any other throw (`lesson_full`, `venue_not_active`, `booking_deadline`, ...). The first entry that passes is enrolled with `enrollInTx(tx, { actor: uid, uid, courseId, scope:"lesson", sessionId, paymentMode: entry.paymentMode, requestId: entry.requestId, byProvider:false, skipPriceCheck:true, promotedFromWaitlist:true, checkoutOn, released: { [sessionId]: { occupied: kind==="occupied"?1:0, held: kind==="held"?1:0 } } })`. One promotion per freed seat. Stripe -> `held`, 30-minute `holdExpiresAt` (already what `enrollInTx` writes).
4. `apply()`: runs the collected `commit()`s, deletes promoted/dropped entries, renumbers the rest (`renumber`), writes `session.waitlisted` `increment(-n)`, queues `waitlist_promoted` (to the promoted user, event key = enrollmentId) and `waitlist_cleared` notifications.
`clearWaitlistInTx(tx, course, sessionId, reason)` reads the whole list now and returns a writer that deletes all entries, sets `waitlisted` to 0 and queues `waitlist_cleared` per user (skipped when the list is empty).

- [ ] **Step 1: Failing tests** (call inside `db.runTransaction` with a hand-built `freed`): promotes position 1 of 3 and renumbers `[1,2]`; skips a suspended user and promotes the next; skips a stripe entry when `checkoutOn:false` (deleted + cleared notice) and promotes the next; entries beyond `PROMOTION_SCAN` untouched when all five fail; window closed -> list cleared, nobody enrolled, `waitlisted 0`; two entries of the SAME user on two sessions in one transaction do not crash on the roster write; unpublished/closed course -> nothing happens, entries kept; `clearWaitlistInTx` on an empty list writes nothing.
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(courses): waitlist promotion planner`.
**Review focus:** 1, 3 (no write before the last read; promotion enrollment id is `sha256(uid:requestId)` so a retried transaction cannot double-enroll).

### Task D5: Promotion on every seat release

**Spec:** §5.5 "whenever a seat is released". **Files:** modify `operations.ts` (`releaseEnrollment`), `checkout.ts` (`fulfillCourseCheckout` refund/unavailable branch), `maintenance.ts` (unchanged call, verify), tests.
**Behaviour:** in both transactions, after the existing reads (enrollment, sessions, course) and BEFORE the first write: `const promo = await planPromotions(tx, { course: {...course, id}, sessions: new Map(...), freed: active.map(id => ({ sessionId: id, kind: enrollment.state === "held" ? "held" : "occupied" })), checkoutOn, now })`; `checkoutOn` is computed before the transaction (`checkoutActive(await readPaymentSettings())`). After the existing writes call `promo.apply()`. Cancelled/non-scheduled sessions are skipped by the planner (reconciliation of a cancelled lesson never promotes). The course `nextAvailableSeats` write uses `increment` so a promotion into the freed seat nets to zero.

- [ ] **Step 1: Failing tests (venue.integration or waitlist.integration):** customer cancels -> first waitlisted becomes `confirmed` (direct) with `promotedFromWaitlist: true`, seat counters unchanged (`occupied` still capacity), `waitlist_promoted` notification queued; staff `cancelCourseEnrollment` for the customer -> same; hold expiry (`maintainCourseEnrollments`) of a Stripe hold promotes the next entry; Stripe webhook `checkout.session.expired` path promotes; late Stripe payment (refund branch of `fulfillCourseCheckout`) promotes; releasing a SERIES enrollment with 3 lessons promotes on each lesson that has a waitlist; replaying the cancel changes nothing (no second promotion); inside the notice window the waitlist is cleared and the seat stays free; lesson with waitlist but a cancelled session (reconciliation) promotes nobody.
- [ ] **Step 2-4:** FAIL, implement, PASS (emulator: `waitlist.integration.test.ts`, `integration.test.ts`). **Step 5: Commit** `feat(courses): promote the waitlist when a seat is released`.
**Review focus:** 1, 3.

### Task D6: `promoteWaitlist` and the maintenance sweep

**Spec:** §5.5 capacity increase, R16. **Files:** modify `waitlist.ts`, `maintenance.ts`, tests.
**Behaviour:** `promoteWaitlist(courseId, sessionId)` loops up to 50 single-seat transactions: read course + session; stop (return count) when the session is not scheduled, `waitlisted === 0`, or `capacity - occupied - held <= 0`; otherwise `planPromotions(..., freed:[{sessionId, kind:"free"}])` + `apply()`; counts `promoted.length`; stops when a round promotes nobody. `maintainCourseEnrollments` gains a sweep after the hold-expiry step: paginated collection-group query `sessions where state == "scheduled" and waitlisted > 0` (skip non-`courses` parents), per session: window closed -> `clearWaitlistInTx(... "window_closed")` in a transaction, else `promoteWaitlist`. Index added in F3.

- [ ] **Step 1: Failing tests:** capacity raised 1 -> 3 by direct session write then `promoteWaitlist` seats two and leaves the third, return value 2, replay returns 0; full lesson -> 0 and no writes; sweep run (`maintainCourseEnrollments.run`) promotes a stranded entry (free seat, entry present) and clears a started lesson's waitlist with `waitlist_cleared`; sweep ignores sessions of other collections named `sessions`.
- [ ] **Step 2-4:** FAIL, implement, PASS. **Step 5: Commit** `feat(courses): standalone waitlist promotion and sweep`.

### Task D7: Concurrency and counter-integrity suite

**Spec:** §9 integration list. **Files:** extend `waitlist.integration.test.ts` (shared helper `assertCounters(db, courseId)`: per session `occupied` == confirmed participants, `held` == held participants, `waitlisted` == waitlist docs, positions are `1..n`, `occupied + held <= capacity`, and `assertLockInvariant`).

- [ ] **Step 1: Tests (all end with `assertCounters`):** (1) three customers enroll in the last seat at once: exactly one `confirmed`, two `lesson_full` with `waitlistAvailable:true`; (2) the two losers join concurrently -> positions `{1,2}`; (3) holder cancels -> first promoted, second renumbered to 1, replay of the cancel is inert; (4) cancel inside the notice window -> list cleared, two `waitlist_cleared`, a walk-in can book; (5) Stripe chain: `checkoutOn`, promoted entry `held`, expire the hold -> second promoted; (6) checkout switched off between join and promotion -> entry dropped, next promoted; (7) `saveCourse` capacity 1 -> 3 promotes two after commit (Task E4 covers the hook; here call `promoteWaitlist`); (8) cancel and join racing on the same lesson (`Promise.allSettled`, 20 iterations): never over capacity, never a lost entry; (9) series with one full lesson creates no enrollment and no participant; (10) join replay, leave replay.
- [ ] **Step 2:** `cd functions && npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run src/courses"` -> all pass, 3 consecutive runs.
- [ ] **Step 3: Commit** `test(courses): waitlist concurrency and counter integrity`.

---

## Group E - `manageCourseSession` additions

All E tasks: tests in `venue.integration.test.ts` / `waitlist.integration.test.ts`; call `assertLockInvariant` and `assertCounters` at the end; commit per task; gates `cd functions && npx tsc --noEmit && npm run lint`.

### Task E1: `reschedule` with `roomId` and revision

**Spec:** §5.6 bullets 1 and 4. **Files:** modify `operations.ts`.
**Behaviour:** optional `roomId` (must be an active room of the course's `locationId`, else `invalid_space`; ignored for unlinked courses). Inside the existing transaction: build old/new `LockSlot`s (`slotsOf` shape for one session) and `updateScheduleLocks(tx, [old], [new])` BEFORE the first write (conflict -> `room_overlap`/`instructor_overlap` with details, nothing written); session update adds `roomId` snapshot and `revision: increment(1)`; `clearWaitlistInTx(tx, course, sessionId, "rescheduled")` (reads before writes). `held > 0` refusal and notice-window checks unchanged; participants still receive `rescheduled`.
- [ ] **Step 1: Failing tests:** room change moves the lock (old room free, new room taken); time change into another course's slot -> `room_overlap`, session untouched; instructor overlap after a time move; revision 1 -> 2; waitlisted customers get `waitlist_cleared` and `waitlisted` becomes 0; `held > 0` still refused; unlinked course reschedule unchanged; draft course takes no locks; invalid room -> `invalid_space`.
- [ ] **Step 2-4 / 5:** FAIL, implement, PASS, commit `feat(courses): reschedule a lesson into another room`.
**Review focus:** 7, 4.

### Task E2: `substitute`

**Spec:** §5.6 bullet 2, U7. **Files:** modify `operations.ts`.
**Behaviour:** `{courseId, sessionId, action:"substitute", instructorId, reason?}`: session must be scheduled and in the future; instructor validated exactly as in B2 (venue link or verified provider; `invalid_instructor`; same instructor as current -> `invalid_instructor`); `updateScheduleLocks(tx,[oldSlot],[newSlot])` (instructor key changes, room key identical) -> `instructor_overlap` with details; session `instructorId`, `instructorName`, `revision: increment(1)`; one `instructor_changed` notification per confirmed/held participant (read the participants subcollection in the transaction). Existing enrollments keep their price snapshot.
- [ ] **Step 1: Failing tests:** substitution updates fields, lock and revision; overlap with the substitute's other class -> `instructor_overlap`, nothing written; unlinked instructor -> `invalid_instructor`; past lesson rejected; notifications queued for each participant (count = participants); price of an existing enrollment unchanged while a NEW quote for the lesson uses the substitute's partner status; the following `saveCourse` (name-only edit) preserves the per-session instructor.
- [ ] **Step 2-4 / 5:** commit `feat(courses): substitute the instructor of one lesson`.

### Task E3: `removeParticipant`, `removeWaitlistEntry`, no-show tracking

**Spec:** §5.6 bullets 3 and 5, §4.5, R20. **Files:** modify `operations.ts`, `store.ts` (types).
**Resolution R20:** `releaseEnrollment` deletes the participant doc, so `lateCancel` cannot live there. Late removals are recorded on the enrollment (`lateCancelledSessionIds: arrayUnion(sessionId)`) and counted per customer on `courses/{id}/customers/{uid}` (`lateCancels: increment(1)`); no-shows are `participants/{uid}.noShow` plus `customers/{uid}.noShows` (`increment(+1/-1)` on attendance transitions to/from `absent`). The roster reads the counters.
**Behaviour:** `removeParticipant {userId, reason?}`: finds the participant doc, `releaseEnrollment(participant.enrollmentId, {kind:"manager", authority}, [sessionId], reason)` (so refund, notification `cancelled_by_trainer` and waitlist promotion all apply); when `session.startsAt <= now + enrollment.cancellationHours*3600000` (past the customer's deadline) it also records the late-cancel marks above in the same transaction (extend `releaseEnrollment` with an options object `{ markLate?: boolean }`, no fee). Past lessons -> `cannot_cancel_past_lesson`. `removeWaitlistEntry {userId}`: transaction like `leaveCourseWaitlist` for another user (authority already resolved). `attendance:"absent"` sets `noShow:true` and the counter; any other value clears it.
- [ ] **Step 1: Failing tests:** remove before the deadline -> seat freed, first waitlisted promoted, no late marks; after the deadline -> `lateCancelledSessionIds` + `lateCancels 1`, still no fee/refund difference; absent -> `noShow true`, `noShows 1`; absent -> present -> `noShows 0`; absent twice does not double count; staff removes a waitlist entry -> renumbered; stranger denied on all three.
- [ ] **Step 2-4 / 5:** commit `feat(courses): staff removal, late-cancel and no-show tracking`.
**Review focus:** 1, 3, 5.

### Task E4: `capacity` action and `saveCourse` capacity increases

**Spec:** §5.6 last bullets. **Files:** modify `operations.ts`, `index.ts`.
**Behaviour:** `capacity {capacity}` 1..500 and `>= occupied + held` (`capacity_below_bookings`); `revision: increment(1)`; recompute the course `nextAvailableSeats` when the session is `nextSessionId`; after the transaction commits, `await promoteWaitlist(courseId, sessionId)`. `saveCourse`: the transaction records `promoteSessionIds` (scheduled sessions with `waitlisted > 0` whose capacity increased); AFTER commit call `promoteWaitlist` for each (sequentially; a failure is logged, never thrown - the sweep is the backstop).
- [ ] **Step 1: Failing tests:** staff raises one lesson's capacity -> promotions happen, revision bumped, counters consistent; lowering below bookings rejected; `saveCourse` 1 -> 3 promotes on every waitlisted lesson only after the response data is committed (assert promotion happened, and that a thrown `promoteWaitlist` is swallowed using a spy); revision bump on every scheduled session (B3).
- [ ] **Step 2-4 / 5:** commit `feat(courses): capacity changes promote the waitlist`.

### Task E5: Cancel, cancel-remaining and archive release locks and clear waitlists

**Spec:** §5.2 lifecycle, §5.5 last bullet. **Files:** modify `operations.ts`, `index.ts`.
**Behaviour:** `manageCourseSession cancel`: in the existing transaction `updateScheduleLocks(tx,[slot],[])` and `clearWaitlistInTx(..., "lesson_cancelled")`. `cancelRemainingCourse`: the transaction releases the slot of every future scheduled session (`slotsOf` of the course's future sessions) and clears every waitlist (sessions with `waitlisted > 0`). `saveCourse` moving a course to `draft`/`archived`: locks already released by B4; additionally `clearWaitlistInTx(..., "archived")` for every session with `waitlisted > 0`.
- [ ] **Step 1: Failing tests:** each of the three paths ends with `assertLockInvariant` and `waitlisted 0` + `waitlist_cleared` notifications; cancelled lesson can be rescheduled into again by another course (slot free); cancelling a session twice does not double-release (second call is the existing `cannot_change_past_lesson`/state path); maintenance cancellation reconciliation still releases enrollments without touching locks again.
- [ ] **Step 2-4 / 5:** commit `feat(courses): cancellation releases locks and clears waitlists`.
**Review focus:** 7, 3.

---

## Group F - Rules, indexes and the staging backend

### Task F1: Venue-aware course rules; lock and dead-staff rules

**Spec:** §5.8, U4. **Files:** modify `firestore.rules`; create `functions/test/unified-courses-rules.test.ts`; extend `functions/test/courses-rules.test.ts` fixtures only if needed.
**Changes:** rename `managesGym(venueId)` -> `managesVenue(venueId)` (all current call sites; body unchanged); in `match /courses/{courseId}`: `managesCourse()` also true for `courseVenue() != null && managesVenue(courseVenue())` where `courseVenue()` = `get(courses/$(courseId)).data.get('venueId', null)`; the `allow read` on the course doc gains `|| (resource.data.get('venueId', null) != null && managesVenue(resource.data.venueId))`; `courseEnrollments` and `courseRefunds` read gain the same clause; new `match /courseScheduleLocks/{id} { allow read, write: if false; }`; delete `match /staff/{staffId}` under `venues`.
- [ ] **Step 1: Failing rules tests** (`projectId demo-vfit-unified-rules`, fixtures: venue `v` owner `owner`, `venueStaff/staff`, inactive staff, course `c {providerId:'p', venueId:'v', state:'published', providerEligible:true}`, draft course `d {venueId:'v', providerId:'p', state:'draft'}`, sessions/participants/customers, enrollment `e {userId:'u', providerId:'p', venueId:'v'}`, refund): owner and active staff read the DRAFT course, participants, customers, enrollments and refunds; query `courseEnrollments where venueId == 'v'` and `courseRefunds where venueId == 'v'` succeed for staff and fail for a stranger; inactive staff and staff of another venue fail; unlinked course `legacy` (no `venueId` field) still readable by its provider and NOT by venue staff; all writes still denied for everyone; `courseScheduleLocks/x` read/write denied even for admin; `venues/v/staff/anyone` read and write denied for staff and admin (rule gone); existing `courses-rules.test.ts` and `partner-gyms-rules.test.ts` still pass.
- [ ] **Step 2-4:** FAIL, edit rules, PASS (emulator, three rules suites). **Step 5: Commit** `feat(rules): venue managers read their courses, rosters and refunds`.
**Review focus:** 5, 8.

### Task F2: Sessions collection-group and waitlist rules

**Spec:** §5.8, R1. **Files:** modify `firestore.rules`, `functions/test/unified-courses-rules.test.ts`.
**Rules:**
```
match /{path=**}/sessions/{sessionId} {
  allow read: if resource.data.get('listed', false) == true &&
    (resource.data.get('venueId', null) == null || activePartnerGym(resource.data.venueId));
}
match /{path=**}/waitlist/{waitlistId} {
  allow read: if isAuthenticated() && resource.data.get('userId', '') == request.auth.uid;
  allow write: if false;
}
// inside match /courses/{courseId}/sessions/{sessionId}:
match /waitlist/{waitlistId} {
  allow read: if managesCourse() || (isAuthenticated() && waitlistId == request.auth.uid);
  allow write: if false;
}
```
- [ ] **Step 1: Failing tests:** unauthenticated `collectionGroup('sessions').where('venueId','==','v').where('listed','==',true).where('state','==','scheduled').where('startsAt','>=',d1).where('startsAt','<',d2)` succeeds for an active partner and returns only listed rows; same query fails after `partnerStatus:'suspended'`; the same query WITHOUT the `listed` constraint fails; an unlinked listed session is readable; unlisted session `get` fails for strangers but passes through the nested course-manager path; customer `collectionGroup('waitlist').where('userId','==',uid)` succeeds, with another uid fails, unauthenticated fails; manager and the entry's own user read `courses/c/sessions/s/waitlist/{uid}`; another customer cannot; no client writes (customer, manager, admin).
- [ ] **Step 2-4:** FAIL, edit, PASS. **Step 5: Commit** `feat(rules): public venue timetable query and waitlist access`.

### Task F3: Indexes

**Spec:** §5.9, R1, R16, R17. **Files:** modify `firestore.indexes.json` (keep the three gym indexes until L2).
Add (matching the file's existing layout):
- `courses` COLLECTION: `(venueId, state, nextStartsAt)` and `(venueId, state, providerEligible, nextStartsAt)`
- `sessions` COLLECTION_GROUP: `(venueId, listed, state, startsAt)`, `(instructorId, listed, state, startsAt)`, `(state, waitlisted)`
- `waitlist` COLLECTION_GROUP: `(userId, createdAt)`
- [ ] **Step 1:** edit. **Step 2:** `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8').replace(/^\s*\/\/.*$/gm,''))"` prints nothing. **Step 3:** `grep -c '"collectionGroup": "waitlist"' firestore.indexes.json` -> `1`.
- [ ] **Step 4: Commit** `feat(indexes): venue timetable, instructor lessons, waitlist and sweep`.
**Done when:** parse check clean. (Deploy and READY check happen in F5; the emulator does not enforce indexes, so F6 and the browser checks are the real proof.)

### Task F4: Keep `listed` in step with provider eligibility

**Spec:** R1. **Files:** modify `functions/src/courses/providerEligibility.ts`, create `providerEligibility.test.ts`.
**Behaviour:** when the trigger flips `providerEligible` on a course, it also batch-updates every `courses/{id}/sessions/*.listed` to `course.state === "published" && eligible` (batches of 400, sequential courses).
- [ ] **Step 1: Failing emulator test:** provider with two published courses (3 sessions each, `listed:true`) is suspended (`applicationStatus:'rejected'`) -> both courses `providerEligible:false` and all six sessions `listed:false`; reinstated -> `true` again; draft course sessions stay `false`; 450 sessions across a course are updated in more than one batch.
- [ ] **Step 2-4 / 5:** commit `feat(courses): eligibility changes update session listing`. Export the handler body as a plain function (`syncCourseEligibility(event)`) and call it with synthetic before/after snapshots, exactly like `providers/syncBusinessVenueLocation.test.ts` does for `mirrorBusinessVenueLocation`.

### Task F5: Deploy the backend to staging (additive)

**Why here:** from this point every UI task is browser-verified with the local dev server (`npm run dev`; `.env.local` points at staging) against the real staging backend. The gym flow stays deployed and untouched (spec §6.6). **Files:** none (plus `scripts/backfill-session-listed.mjs`, created here).
- [ ] **Step 1: Preconditions.** `git branch --show-current` = `main`; `git fetch && git log HEAD..origin/main --oneline` (note foreign commits); `git status --short -- functions firestore.rules firestore.indexes.json` shows nothing foreign (otherwise deploy from a clean `git worktree add ../vfit-deploy HEAD`, `ln -s $PWD/functions/node_modules ../vfit-deploy/functions/node_modules`, and run the commands below from that worktree).
- [ ] **Step 2: Gates.** `cd functions && npx tsc --noEmit && npm run lint && npm run build`; full emulator run `npx firebase emulators:exec --only firestore --project demo-vfit "npx vitest run"` (compare with the Task 0 baseline: no new failures).
- [ ] **Step 3: Backfill script.** Create `scripts/backfill-session-listed.mjs` (dry run by default, `--project vfit-app-staging [--apply]`, ADC, same flag handling and header comment style as `scripts/backfill-search-tokens.mjs`): for every `courses` doc with `venueId != null`, set `listed = (state === "published" && providerEligible === true)` on every session whose value differs; print counts; idempotent. Run the dry run on staging: expected `0 documents to update` or a small number; run `--apply` if non-zero. (Individual, unlinked courses never use the group rule, so they need no backfill.)
- [ ] **Step 4: Indexes first.** `npx firebase deploy -P staging --only firestore:indexes`; poll `npx firebase firestore:indexes -P staging | grep -ci creating` until `0` (can take minutes; composite collection-group indexes must be READY before the first query).
- [ ] **Step 5: Rules.** `npx firebase deploy -P staging --only firestore:rules`.
- [ ] **Step 6: Functions.** `npx firebase deploy -P staging --only functions:saveCourse,functions:previewCourse,functions:quoteCourse,functions:enrollInCourse,functions:enrollCourseParticipant,functions:notifyCourseParticipant,functions:cancelCourseEnrollment,functions:recordCoursePayment,functions:manageCourseSession,functions:confirmCourseRefund,functions:cancelRemainingCourse,functions:joinCourseWaitlist,functions:leaveCourseWaitlist,functions:createCourseCheckout,functions:courseStripeWebhook,functions:maintainCourseEnrollments,functions:remindCourseParticipants,functions:onCourseNotification,functions:onCourseProviderEligibility,functions:saveGymSpace,functions:configureGymInstructor --force` plus any P1 function missing on staging (`npx firebase functions:list -P staging | grep -i "syncBusinessVenueLocation\|releaseBusinessVat\|applyAsProvider"`; deploy missing ones with `--force` for retry triggers). Run outside the sandbox.
- [ ] **Step 7:** `npx firebase functions:list -P staging | grep -E "quoteCourse|joinCourseWaitlist|leaveCourseWaitlist"` shows the three new callables in `europe-west1`.
- [ ] **Step 8: Commit** the backfill script `chore(courses): backfill session listing for venue-linked courses`; `git push` (after `gh auth switch --user hidran`).
**Done when:** steps 4-7 print the expected output and the dry run is clean.

### Task F6: Staging smoke script (backend, end to end)

**Spec:** §9 smoke list. **Files:** create `scripts/smoke-unified-courses-staging.mjs` (pattern of `scripts/smoke-group-courses-staging.mjs`: `.env.staging` project assert, identity-toolkit login, callable POST helper, REST document read, `mark()` evidence, `output/playwright/unified-courses-staging-smoke.json`). Seeding and cleanup use `firebase-admin` with ADC (as `backfill-search-tokens.mjs`), hard-asserted to `vfit-app-staging`.
**CLI:** no flag = seed, run, clean up; `--keep` = leave the fixture venue/courses for UI work; `--cleanup` = remove a kept fixture only.
**Accounts (staging):** owner `demo.provider@vitfitdemo.dev`; instructor B `journey.en.provider@vitfitdemo.dev` (verified provider); staff `journey.it.provider@vitfitdemo.dev` (made `venueStaff`); customers `demo.customer@vitfitdemo.dev`, `journey.en.customer@vitfitdemo.dev`, `journey.it.customer@vitfitdemo.dev`; admin `demo.admin@vitfitdemo.dev`. Passwords from the memory notes / env overrides like the existing smoke script.
**Scenarios (each a `mark()`):**
1. Seed venue `smoke_unified_venue` (type `gym`, `ownerId` = owner uid, `partnerStatus: active`, `isActive`, `memberDiscountPercent 10`, `partnerInstructorExtraPercent 5`) and `venueStaff/{staffUid}` via Admin SDK; owner `saveGymSpace` creates one location (Europe/Rome) and two rooms; admin `configureGymInstructor` links instructor B with `partnerStatus: active`.
2. Owner `saveCourse` publishes course A (room 1, instructor B, capacity 1, 3 daily lessons 7 days ahead, lesson 1500, series 4000); venue timezone forced to the location's.
3. Overlap rejection: course B same room/time -> `room_overlap` with course A's name; course C other room, same instructor/time -> `instructor_overlap`; course C in room 2 with no instructor saves.
4. Customer `quoteCourse`: lesson `finalCents 1275`, `discountPercent 15`; stale `expectedFinalCents` -> `price_changed`; correct quote enrolls with `totalCents 1275` and `discountCents 225`.
5. Last seat: customer 2 `enrollInCourse` -> `lesson_full`; `joinCourseWaitlist` -> position 1; customer 3 joins -> position 2; customer 1 cancels -> customer 2 `confirmed`, `promotedFromWaitlist true`, customer 3 renumbered to position 1; replayed cancel is inert; lesson counters consistent.
6. Staff (venueStaff, not owner) `manageCourseSession substitute` to a different venue-linked instructor -> revision 2; substitute overlap -> `instructor_overlap`; staff `capacity` raise promotes customer 3; staff `recordCoursePayment`; staff `removeParticipant`.
7. Free lesson course (price 0) -> enroll with `paymentMode: stripe` -> `direct`/`paid`/`confirmed`.
8. Authority: stranger customer cannot `manageCourseSession`/`recordCoursePayment` (`course_owner_required`); public REST read of `courses/{A}/sessions/{s}/waitlist/{uid}` is 403.
9. Public timetable query (REST `runQuery`, collection group `sessions`, `venueId == smoke_unified_venue`, `listed == true`, `state == scheduled`, no auth) returns A's 3 lessons; after suspending the venue (Admin SDK) it returns 403; restore.
10. Cleanup (unless `--keep`): `cancelRemainingCourse` for every created course, delete the fixture venue subtree, `venueStaff` doc, the instructor link and reset instructor B's `partnerStatus`; the lock invariant is checked through Admin SDK (no `courseScheduleLocks` slot keyed by the test courses remains).
- [ ] **Step 1:** write the script; `node --check scripts/smoke-unified-courses-staging.mjs` prints nothing.
- [ ] **Step 2:** run `node scripts/smoke-unified-courses-staging.mjs --keep` (outside the sandbox). Expected: every line `PASS ...`, last line `Evidence: output/playwright/unified-courses-staging-smoke.json`, exit 0. Fix real defects with TDD in the owning group (new commit per fix, redeploy only the touched function with `--only functions:<name> --force`), then re-run until green.
- [ ] **Step 3: Commit** `test(courses): staging smoke for unified courses`.
**Done when:** the whole script passes twice in a row (second run after `--cleanup`), leaving the fixture only when `--keep` is given. The fixture (venue `smoke_unified_venue`, courses A and the free course) is what the Group G/H browser checks use; `--cleanup` runs in K3.

---

## Group G - Frontend: types, authoring and management

Every G/H task: write the component test first (Vitest + Testing Library; mock `@/lib/firebase/courses`, `@/hooks/useI18n` is the real one), then implement, then `npx tsc --noEmit -p .`, `npx vitest run <paths> src/i18n/messages/completeness.test.ts`, `npx eslint <touched files>`, then a LOCAL BROWSER CHECK: `npm run dev`, Playwright MCP at 390x844 (it, then en), sign in with the staging accounts of Task F6 (fixture venue `smoke_unified_venue`), screenshot into `output/playwright/`. Every new string gets all five locales in the same commit. Touch targets >= 44px; labels bound to inputs; errors `role="alert"`.

### Task G1: Types, wrappers, hooks, error catalog

**Spec:** §8, §6.4. **Files:** modify `src/types/course.ts`, `src/lib/firebase/courses.ts`, `src/hooks/useCourses.ts`; create `src/lib/courseErrors.ts`, `src/lib/courseErrors.test.ts`; add keys `courses.err.*` to the five locale files.
**Creates:** every type of the registry (`CourseDraft` fields from A1; `CourseSession`: `revision, instructorId, instructorName, roomId, locationId, venueId, courseId, listed, waitlisted`; `CourseEnrollment`: `venueId, regularCents, discountCents, discountPercent, promotedFromWaitlist, sessionRevisions, lateCancelledSessionIds`; `CourseParticipant`: `noShow`; `CourseWaitlistEntry`; `CourseQuote`/`SessionQuote` mirroring `quote.ts`); wrappers `quoteCourse`, `joinCourseWaitlist`, `leaveCourseWaitlist`; fetchers `fetchVenueCourses`, `fetchVenueEnrollments`, `fetchVenueRefunds`, `fetchWaitlist` (`orderBy('position')`), `fetchMyWaitlist` (collection group `waitlist`, `where userId == uid`, `orderBy createdAt`), `fetchVenueWeek(venueId, weekStart)` (collection group `sessions`: `venueId ==`, `listed == true`, `state == 'scheduled'`, `startsAt >=` weekStart-1d UTC, `< ` weekStart+8d UTC; callers filter the exact week), `fetchVenueNextLessons(venueId, n)` (same equalities, `startsAt >= now`, `orderBy startsAt`, `limit n`), `fetchCustomerCounters(courseId)` (`courses/{id}/customers`); hooks `useCourseQuote`, `useManagedVenueCourses`, `useVenueEnrollments`, `useVenueRefunds`, `useWaitlist`, `useMyWaitlist`, `useVenueWeek`, `useVenueNextLessons`, `useCustomerCounters` (same query-key family `['courses', ...]` so `useRefreshCourses` invalidates them; `refetchInterval` 30s for public data). `saveCourse(course, courseId?, providerId?)` gains the optional provider id (used for on-behalf creation). `COURSE_ERROR_CODES` (the registry list) and `courseErrorMessage(err: unknown, t): string` read `err.message`/`err.details` (Firebase callable errors) and return `t('courses.err.<code>')`, interpolating `{name, time}` from `details` for overlap codes (time formatted in the browser locale), falling back to `t('courses.error')`.
- [ ] **Step 1: Failing test** `courseErrors.test.ts`: every code in `COURSE_ERROR_CODES` maps to a key that exists in `itMessages`; overlap message contains the conflicting course name; unknown error -> `courses.error`; `price_changed` returns its two reasons' distinct keys.
- [ ] **Step 2-4:** FAIL -> implement -> PASS; `npx tsc --noEmit -p .` (fix call sites of changed types minimally: `CourseEditor.emptyDraft` already updated in A1). **Step 5: Commit** `feat(courses-ui): types, wrappers, hooks and error catalog`.

### Task G2: Managed venues and navigation

**Spec:** §6.5. **Files:** create `src/hooks/useManagedVenues.ts` (+test); modify `src/components/layout/DashboardModeSwitch.tsx`, `DashboardModeSwitch.test.tsx`, `src/app/(main)/provider/layout.tsx`; keys `courses.venueCourses` (nav label "Venue courses") x5.
**Creates:** `useManagedVenues(): { venues: Venue[]; isLoading: boolean }` = venues where `ownerId == uid` (Firestore query) plus the venue of an active `venueStaff/{uid}` (doc read), deduplicated, only `isActive !== false`. `DashboardModeSwitch`: `canSwitchMode` also true when the user manages a venue; for a managing user who is not provider/admin the professional link is `/provider/courses?venue={firstVenueId}` and its label `courses.venueCourses`. Provider layout: `canAccess` also true for venue managers (do not redirect while `isLoading`); for a non-provider manager `NAV_ITEMS` is reduced to the `courses.manage` entry (carrying `?venue=`) and the mode switch.
- [ ] **Step 1: Failing tests:** hook returns owner venues + staff venue, dedupes, ignores inactive staff; switch shows the professional tab for a customer who owns a venue and links to `/provider/courses?venue=biz_x`; admin/provider behaviour unchanged (existing tests stay green); layout renders only the Courses entry for such a user and does not redirect (mock `useRouter`), redirects a plain customer.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check (demo.customer made `venueStaff` by `scripts`-style Admin snippet in the test notes, restored afterwards) -> commit `feat(nav): venue managers reach course management`.

### Task G3: `VenueSpacesPanel`

**Spec:** §6.2 last bullet, §4.7. **Files:** create `src/types/venueSpaces.ts`, `src/lib/firebase/venueSpaces.ts` (moves `fetchGymLocations/Rooms/Instructors` as `fetchVenueLocations/Rooms/InstructorLinks`, and `venueCall`), `src/components/venues/VenueSpacesPanel.tsx` (+test); modify `src/lib/firebase/gym.ts` (re-export the three fetchers from the new module so `GymManageClient` stays untouched until L3), `src/components/admin/venues/GymInstructorPanel.tsx` (import from the new lib), `src/components/admin/venues/VenueDetailView.tsx` (mount the panel for `hostsCourses` venues). Reuse existing `gym.*` keys for labels; new keys `venueSpaces.title`, `venueSpaces.empty`, `venueSpaces.deactivate`, `venueSpaces.activate` x5.
**Props:** `{ venueId: string }`. Lists active and inactive locations with their rooms; forms: add location (name, address, city, IANA timezone with the `Europe/Rome` default), add room under a chosen location; per-item activate/deactivate through `saveGymSpace` (`isActive`); shows the instructor links read-only. Visible only when `useManagedVenues` contains `venueId` or the user is admin.
- [ ] **Step 1: Failing tests:** renders locations/rooms; submit add-location posts `{kind:'location', venueId, name, address, city, timezone, isActive:true}`; add-room button disabled without a location; toggle posts `isActive:false`; a server error is shown through `courseErrorMessage`; hidden for strangers.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check on `/admin/venues` detail and later in G5 -> commit `refactor(venues): VenueSpacesPanel for locations and rooms`.

### Task G4: `InstructorPicker` and the `CourseEditor` venue cascade

**Spec:** §6.1. **Files:** create `src/components/courses/InstructorPicker.tsx` (+test); modify `CourseEditor.tsx`, `CourseEditor.test.tsx`, `CourseEditorPage.tsx`; keys `courses.venue`, `courses.noVenue`, `courses.locationSelect`, `courses.room`, `courses.instructorSelect`, `courses.instructorOther`, `courses.linkInstructor`, `courses.waitlist`, `courses.free`, `courses.addSpaces`, `courses.timezoneFromLocation`, `courses.conflict` x5.
**Behaviour:** `useManagedVenues()` feeds a **Venue** select (default "No venue" -> `venueId null`; initial value from `?venue=` or the edited course). Choosing a venue loads active locations (auto-select when exactly one) then active rooms; `timezone` becomes the location's and the field read-only with helper `courses.timezoneFromLocation`; `location`/`city` fields are hidden and set to `${room.name} · ${location.name}` / `location.city`; zero locations or rooms -> inline `Link` "Add locations and rooms" to `/provider/courses?venue={id}#spaces`. `InstructorPicker({venueId, value:{instructorId, name}, onChange})`: venue-linked -> select of the venue's active instructor links plus "Other (type a name)" (clears `instructorId`, shows the free-text input); unlinked -> the free-text input plus an optional typeahead "Link to a registered instructor" (debounced 300 ms, reuse the provider search in `src/hooks/useProviders.ts` / `src/lib/firebookings.ts`; selecting sets `instructorId` and `instructor`). **Waitlist** checkbox (default true). Price inputs `min="0"`, helper "Free" when the value is 0. On save: `providerId` is sent only when the selected venue's `ownerId` differs from the signed-in uid (staff creating on behalf: `venue.ownerId`). Preview renders `conflicts` from `previewCourse` as a row under the conflicting lesson (`courses.conflict` with course name and time); save errors go through `courseErrorMessage`. Frozen-after-booking fields (`venueId, locationId, roomId, instructorId`) are disabled when the edited course has bookings (any session with `occupied + held > 0` from `useCourseSessions`).
- [ ] **Step 1: Failing tests:** cascade (venue -> location -> room, one-location auto-select, timezone input readonly), no managed venues hides the venue select, "No venue" behaves as today (existing tests unchanged), staff-on-behalf sends `providerId`, `0` price accepted, instructor "Other" path, overlap row rendered from a mocked `previewCourse` result, locked fields disabled for a booked course.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check (create a course in the fixture venue, see the overlap error against course A, create the free one) -> commit `feat(courses-ui): venue, room and instructor in the course editor`.

### Task G5: Manage courses - venue scope, roster signals

**Spec:** §6.2 bullets 1 and 3 (badges, counts, reschedule room). **Files:** create `src/components/courses/ProviderCourses.tsx` (body moved from the page), modify `src/app/(main)/provider/courses/page.tsx` (`<Suspense><ProviderCourses /></Suspense>`), `AddCourseParticipant.tsx`, `ParticipantInvitation.tsx` (+tests: pass `courseId`), add `ProviderCourses.test.tsx`; keys `courses.venueScope`, `courses.noShow`, `courses.noShows`, `courses.lateCancels`, `courses.rescheduleRoom` x5.
**Behaviour:** `?venue={id}` -> data from `useManagedVenueCourses/useVenueEnrollments/useVenueRefunds`; header shows the venue name and a venue switcher when the user manages several; `Create course` links carry `?venue=`; `VenueSpacesPanel` section with `id="spaces"`; a non-provider manager without `?venue=` is redirected to their first venue. Roster rows show `noShow` badge, `customers/{uid}.noShows` ("n no-shows" when >= 2) and the late-cancel list (enrollments whose `lateCancelledSessionIds` include the lesson); reschedule gets a room select (active rooms of the course location) sending `roomId`; `AddCourseParticipant`/`ParticipantInvitation` send `courseId`; all errors via `courseErrorMessage`.
- [ ] **Step 1: Failing tests:** venue-scoped queries are used when `?venue=` is set and provider queries otherwise; non-provider manager redirect; badge and counters; reschedule sends `roomId`; invitations send `courseId`.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check as owner and as staff (fixture venue) -> commit `feat(courses-ui): venue-scoped course management`.

### Task G6: Lesson actions - waitlist, substitute, capacity, remove

**Spec:** §6.2 bullet 2. **Files:** create `src/components/courses/{LessonWaitlist,SubstituteInstructor,LessonCapacity}.tsx` (+tests); modify `ProviderCourses.tsx`; keys `courses.waitlistTitle`, `courses.position`, `courses.removeEntry`, `courses.substitute`, `courses.capacityAction`, `courses.removeParticipant`, `courses.removeLateWarning`, `courses.confirmRemove` x5.
**Behaviour:** `LessonWaitlist({courseId, sessionId})` lists entries (`useWaitlist`) with position, name and a Remove button (`removeWaitlistEntry`, confirm). `SubstituteInstructor({course, session})` reuses `InstructorPicker`, posts `substitute`; overlap errors shown with the conflicting class. `LessonCapacity` posts `capacity` (min = occupied + held). Roster rows get **Remove participant** with a confirm that warns when past the customer's deadline (late cancel recorded, no fee). All use `manageCourseSession` via `courseCall` and refresh.
- [ ] **Step 1: Failing tests:** each component posts the exact payload (`action`, ids) and surfaces `instructor_overlap` / `capacity_below_bookings` translated; waitlist shows renumbered positions after a refetch; the late warning shows only past the deadline.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check on the fixture (substitute to instructor C, capacity, remove) -> commit `feat(courses-ui): waitlist, substitute and capacity on a lesson`.

---

## Group H - Frontend: customer timetable, booking, bookings

### Task H1: Weekly venue timetable

**Spec:** §6.3. **Files:** create `src/components/courses/{VenueTimetable,TimetableCard}.tsx` (+tests); modify `src/app/(main)/fit/gyms/timetable/page.tsx` (render `VenueTimetable`; the old `GymTimetableClient` is no longer imported, deleted in L3); keys `timetable.title`, `timetable.week`, `timetable.previous`, `timetable.next`, `timetable.allRooms`, `timetable.allLocations`, `timetable.allInstructors`, `timetable.seatsLeft`, `timetable.full`, `timetable.waitlistOpen`, `timetable.empty`, `timetable.manage`, `timetable.suspended` x5 (the page title "Gym timetable" key `gym.timetable` is reused by the venue page).
**Behaviour:** `?id={venueId}`; venue via `useVenue`; if `partnerStatus !== 'active'` or inactive -> message (the query would be denied). Week from `weekStart(localDay(new Date(), tz))` (`src/lib/gymTime.ts` is reused) with previous/next; data `useVenueWeek` plus the venue's published courses (public `courses` query by `venueId`, `state`, `providerEligible`) for name/price/waitlist flag; locations for timezone; filters location / room / instructor are client-side. Desktop (`md:`): seven columns Mon-Sun, rows by start time, cards coloured by room (palette index from `roomId`, the room name always printed so colour is not the only cue). Mobile: seven day tabs (`aria-pressed`) listing that day's cards in time order. `TimetableCard` shows course name, instructor, `HH:mm-HH:mm` in the lesson's location timezone, `timetable.seatsLeft` or `timetable.full` / `timetable.waitlistOpen`, and the price: signed-in users see `quoteCourse` final price with the regular price struck through when discounted (one quote call per course with the visible lesson ids, `staleTime` 60s, max 20 courses); visitors see the regular price. The card is a `Link` to `/courses?id={courseId}&lesson={sessionId}`. Managers (`useManagedVenues`) get a `timetable.manage` link to `/provider/courses?venue=`.
- [ ] **Step 1: Failing tests:** a Monday and a Sunday lesson land in the right columns (also across a DST-change week: `2026-10-25`); day tabs show only that day on mobile; filters narrow the list; full lesson shows waitlist label when `waitlistEnabled`, "Full" otherwise; discounted price shows both amounts; visitor shows regular only; empty week message; suspended venue message.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check at 390x844 (day tabs) and 1280 (grid), it and en, light and dark -> commit `feat(courses-ui): public weekly venue timetable`.

### Task H2: Booking sheet with quote, `price_changed` and waitlist

**Spec:** §5.4, §6.3 last bullet, §6.4. **Files:** create `src/components/courses/CourseQuoteReview.tsx` (+test); modify `CourseBooking.tsx` (+test), `src/app/(main)/courses/page.tsx`; keys `courses.regularPrice`, `courses.partnerBenefit`, `courses.instructorBenefit`, `courses.discount`, `courses.finalPrice`, `courses.priceChanged`, `courses.availabilityChanged`, `courses.joinWaitlist`, `courses.onWaitlist`, `courses.waitlistFull`, `courses.freeLabel` x5.
**Behaviour:** `CourseBooking` uses `useCourseQuote` (signed-in) to show per-lesson and series final prices (regular struck through when discounted, "Free" for 0); a full lesson shows **Join waitlist** when `course.waitlistEnabled !== false`, the lesson is outside the notice window and the user is not enrolled (disabled otherwise); an existing entry shows `courses.onWaitlist` with position and Leave. `CourseQuoteReview` (the review modal body) lists regular price, gym and instructor benefit lines, discount, final price and cancellation terms; free hides the payment options (Stripe is never offered for 0). Confirm sends `expectedFinalCents` (= quote final) and `expectedRevisions` (= quote revisions of the reviewed lessons) to `enrollInCourse`; a `price_changed` error refetches the quote, keeps the sheet open on the new numbers with a banner (`courses.priceChanged` for reason `price`, `courses.availabilityChanged` for `availability`) and requires a fresh confirm. `?lesson={sessionId}` opens the review for that lesson once sessions are loaded.
- [ ] **Step 1: Failing tests:** discount lines render from a mocked quote; first confirm rejects with `{message:'price_changed', details:{reason:'price'}}` -> banner + updated amount + second confirm succeeds with the new expected values; availability variant uses its own text; free review has no payment radios; waitlist button visible/disabled/hidden per condition; `?lesson=` opens the sheet.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check on the fixture (discount visible; waitlist join on the capacity-1 lesson) -> commit `feat(courses-ui): priced booking review and waitlist join`.

### Task H3: Venue page - next lessons

**Spec:** §6.3 last two sentences. **Files:** modify `src/app/(main)/venue/VenueDetailClient.tsx`, `VenueDetailClient.test.tsx`; keys `venue.nextLessons`, `venue.fullTimetable` x5.
**Behaviour:** replace the legacy classes tab/section (`useVenueCourses`) by `useVenueNextLessons(venueId, 3)`: up to three lessons (course name from the venue's published courses query, time, instructor) and a "Full timetable" link to `/fit/gyms/timetable?id=`; renders nothing when none and the venue has no published courses; the existing timetable button gating via `hostsCourses` stays.
- [ ] **Step 1: Failing tests** (update the existing test that mocked `useVenueCourses`): three lessons + link; none -> no section; non-course venue types untouched. **Step 2-5:** FAIL -> implement -> PASS -> browser check on `/venue?id=smoke_unified_venue` -> commit `feat(venue): next lessons replace legacy class cards`.

### Task H4: Customer bookings - waitlist entries and promotion

**Spec:** §6.4. **Files:** create `src/components/courses/MyWaitlist.tsx` (+test); modify `CourseEnrollments.tsx` (+test via the new component); keys `courses.waitlistSection`, `courses.leaveWaitlist`, `courses.payWithin` x5.
**Behaviour:** `/courses?tab=bookings` shows enrollments (existing) and a **Waitlist** section from `useMyWaitlist`: course name link, lesson date in the course timezone, `#position`, **Leave** (confirm, `leaveCourseWaitlist`); entries whose lesson already started are hidden. A held enrollment with `promotedFromWaitlist` shows `courses.payWithin` with the remaining minutes next to the existing Pay button; promoted direct enrollments show the normal confirmed card.
- [ ] **Step 1: Failing tests:** entry renders with position; leave calls the callable and refetches; past entries hidden; promoted held enrollment shows the pay-within text.
- [ ] **Step 2-5:** FAIL -> implement -> PASS -> browser check (customer 2 joins, customer 1 cancels, customer 2 sees the promoted booking) -> commit `feat(courses-ui): waitlist entries in my course bookings`.

---

## Group I - i18n audit

### Task I1: Five-locale audit (client and server)

**Files:** locale files only if gaps are found. 
- [ ] **Step 1:** `npx vitest run src/i18n/messages/completeness.test.ts functions/src/notifications/bookingMessages.test.ts` (the latter from `cd functions`) green.
- [ ] **Step 2:** list every key used by the new components (`grep -rhoE "t\('(courses|timetable|venue|venueSpaces)\.[A-Za-z.]+'" src/components/courses src/components/venues "src/app/(main)/courses" "src/app/(main)/provider" "src/app/(main)/fit/gyms" "src/app/(main)/venue"`), assert each exists in `it.ts` (one-off shell loop; fix gaps).
- [ ] **Step 3:** eyeball the de/fr strings of the longest labels (`courses.err.room_overlap`, `courses.removeLateWarning`, `timetable.waitlistOpen`) at 320px in the browser: no overflow; fix with copy or wrapping.
- [ ] **Step 4: Commit** (only if changes) `fix(i18n): close unified-courses translation gaps`.

---

## Group J - Documentation

### Task J1: `docs/features.md` and `docs/database-schema.md`
**Files:** modify both. **Content:** features - "Group courses" section rewritten for the unified model (venue link, rooms/locations, overlap protection, instructor assignment and substitution, partner discounts and `price_changed`, waitlist rules incl. the notice window, free lessons, no-shows/late cancels, public weekly timetable, venue staff scope); database-schema - fields of §4.1-4.6 plus R-resolutions (`listed`, `courseId` on sessions, `customers` counters, `lateCancelledSessionIds`, lock slot value with `courseName`), `courseScheduleLocks`, waitlist subcollection, rules summary (§5.8) and the new indexes; mark the gym collections "removed in the final task of the unified-courses plan" (the actual deletion of the old sections is L5).
- [ ] Write; `grep -n "waitlist\|courseScheduleLocks\|listed" docs/database-schema.md` shows the new entries; **Commit** `docs: unified courses data model and features`.

### Task J2: API and cloud-function docs
**Files:** modify `docs/api/reference.md`, `docs/backend/cloud-functions.md`, `docs/backend/roles-and-permissions.md`. **Content:** input/output/errors of `quoteCourse`, `joinCourseWaitlist`, `leaveCourseWaitlist`, changed `saveCourse`, `previewCourse` (`conflicts`), `enrollInCourse` (`expectedFinalCents`, `expectedRevisions`, `price_changed`), `enrollCourseParticipant`/`notifyCourseParticipant` (`courseId`), every `manageCourseSession` action, the error-code table (registry), maintenance sweep, notification events; roles doc - `managesVenue`/`canManageCourse` matrix.
- [ ] Write; **Commit** `docs: unified courses API reference`.

### Task J3: User journeys and index
**Files:** modify `docs/user-journeys/group-courses.md` (venue-linked authoring, price review, free lessons, waitlist, substitution, staff removal, no-show) and `docs/README.md` (add the new guide link); create `docs/user-journeys/venue-courses.md` (owner/staff: locations, rooms, instructor links, courses, timetable, discounts, waitlist; customer: weekly grid, member price, review, waitlist). Do NOT delete `partner-gym-timetable.md` yet (L5).
- [ ] Write; **Commit** `docs: venue course journeys`.

---

## Group K - Staging release and browser verification

### Task K1: Full gates and staging hosting

**Files:** none (deploy). 
- [ ] **Step 1:** `git branch --show-current` = `main`; `git fetch && git log HEAD..origin/main --oneline`. **Step 2: Gates:** `npx tsc --noEmit -p .`; `npx vitest run` (only the Task 0 baseline failures remain; stash-compare any other); `npx eslint src/components/courses src/components/venues src/hooks src/lib "src/app/(main)/courses" "src/app/(main)/provider" "src/app/(main)/fit" "src/app/(main)/venue"`; functions gate + full emulator suite.
- [ ] **Step 3:** if backend code changed since F5, redeploy the touched functions (`--only functions:<names> --force`), rules and indexes (indexes first, wait READY).
- [ ] **Step 4:** `npm run build:staging && npx firebase deploy -P staging --only hosting` (outside the sandbox). **Step 5:** `node scripts/smoke-unified-courses-staging.mjs --keep` passes again against the final deployed backend. **Step 6:** `git push` (after `gh auth switch --user hidran`).
**Done when:** build, deploy and smoke print success.

### Task K2: Playwright journeys (390x844, it and en)

Use Playwright MCP with fresh private contexts; evidence into `output/playwright/unified-courses-*.png` plus a short `unified-courses-journeys.json` (step name, URL, pass/fail). Fixture: `--keep` data of F6.
1. **Owner authoring (it):** `demo.provider` -> `/provider/courses/create`, venue -> location -> room -> instructor, timezone read-only, preview shows the room-overlap row against course A, fix and save.
2. **Timetable (it, mobile):** logged-out visitor sees `/fit/gyms/timetable?id=smoke_unified_venue` day tabs with regular prices; `demo.customer` logged in sees struck-through regular + member price.
3. **Discounted booking + `price_changed` (en):** customer opens a card, reviews (15% lines), meanwhile the owner changes capacity in a second context, confirm -> availability-changed banner, confirm again -> booked.
4. **Waitlist (en):** customer 2 on the full lesson joins the waitlist -> `/courses?tab=bookings` shows `#1`; customer 1 cancels; customer 2's booking appears (promoted) and a notification exists.
5. **Venue staff scope (it):** a customer account made `venueStaff` (Admin snippet) sees the professional tab, only "Courses" in the nav, the venue-scoped list, substitutes an instructor and raises capacity.
6. **Free lesson (en):** books the free course, no payment options, shows "Free" and paid status.
7. **Dark and light** pass of the timetable and review at 390x844; 320px check of the de timetable header.
- [ ] Fix real defects as TDD follow-ups in their owning group (new commits, redeploy hosting/functions as needed); re-run the failing journey. **Done when:** all seven journeys pass in the final deployed build.

### Task K3: Staging record and fixture cleanup

**Files:** modify `docs/deployment/staging.md` (new dated entry: commit, deployed functions/rules/indexes, tests run with counts, smoke + journey evidence paths, known gaps), create nothing else.
- [ ] **Step 1:** `node scripts/smoke-unified-courses-staging.mjs --cleanup` removes the kept fixture. **Step 2:** write the record. **Step 3: Commit** `docs: staging record for unified courses`; `git push`.

---

## Group L - Remove the partner-gym flow (LAST)

Precondition for the whole group: Tasks K1-K3 are done and green (the unified flow is proven on staging).

### Task L1: Port-check, then delete the gym backend

**Spec:** §4.8. **Files:** delete `functions/src/partnerGyms/` (all 7 files), edit `functions/src/index.ts` (remove the three `./partnerGyms/*` exports), delete `functions/src/partnerGyms/integration.test.ts` and `core.test.ts` with it.
- [ ] **Step 1: Port-check table.** `grep -n "^\s*it(\|^\s*describe(" functions/src/partnerGyms/*.test.ts functions/test/partner-gyms-rules.test.ts`; write each case and the new test that covers it (or `dropped: <reason>`) into the Execution log below. Expected coverage: quote maths (C1/C2), overlap and lock races (A3/B4), DST (A1/B2), capacity/booking races (D7), authority (A5/B1), cancel/refund (C4), rules (F1/F2 and L2's moved instructor-partnership test). Any unmapped case becomes a new test in the owning group before deletion.
- [ ] **Step 2:** `git rm -r functions/src/partnerGyms`; edit `index.ts`; `cd functions && npx tsc --noEmit && npm run lint && npm run build`; `grep -rn "partnerGyms" functions/src` -> no output.
- [ ] **Step 3:** emulator run of `src/courses src/venues src/providers src/notifications` all green.
- [ ] **Step 4: Commit** `refactor(functions): remove the partner-gym booking flow`.

### Task L2: Remove gym rules and indexes

**Files:** `firestore.rules`, `firestore.indexes.json`, `functions/test/partner-gyms-rules.test.ts`, `functions/test/unified-courses-rules.test.ts`.
- [ ] **Step 1:** move the "instructor partnerStatus cannot be self-activated" test (coach/rogue/admin) from `partner-gyms-rules.test.ts` into `unified-courses-rules.test.ts` and run it green first. **Step 2:** delete `match /gymSessions`, `/gymBookings`, `/gymSeries`, `/gymScheduleLocks`, `/gymSessionMembers`, `/gymNotifications` from the rules (keep `managesVenue`, `activePartnerGym`); delete the three `gymSessions`/`gymBookings` indexes; `git rm functions/test/partner-gyms-rules.test.ts`.
- [ ] **Step 3:** emulator rules suites (`test/unified-courses-rules.test.ts`, `test/courses-rules.test.ts` and any other rules test) green; JSON parse check from F3.
- [ ] **Step 4: Commit** `refactor(rules): drop partner-gym collections and indexes`.

### Task L3: Remove gym UI, lib, types, legacy cards

**Files:** delete `src/components/gym/{GymManageClient,GymBookings,GymTimetableClient}.tsx`, `src/app/(main)/gym/`, `src/lib/firebase/gym.ts`, `src/types/gym.ts`; modify `src/app/(main)/bookings/page.tsx` (drop `GymBookings`), `src/hooks/useVenues.ts` + `src/hooks/index.ts` (remove legacy `useVenueCourses` and its export), `src/app/(main)/venue/VenueDetailClient.test.tsx` mocks, the seed(s) that write `venues/{v}/courses` (`grep -rn "courses" functions/src/seed/seedData.ts scripts/seed-*.js | grep -i venue`), locale files (unused `gym.*` keys), any `gym_class` notification-type handling (`grep -rn "gym_class" src functions/src`).
- [ ] **Step 1:** `git rm` the files; fix imports; `grep -rn "components/gym\|firebase/gym\|types/gym\|useVenueCourses\|tab=gym\|gym/manage\|gym_class" src functions/src` -> no output (except the `src/lib/gymTime.ts` import name, which stays).
- [ ] **Step 2: Unused `gym.*` keys.** List `gym.` keys in `it.ts` not referenced anywhere in `src` (`for k in $(grep -oE "'gym\.[A-Za-z.]+'" src/i18n/messages/it.ts | tr -d "'" | sort -u); do grep -rq "$k" src --include='*.ts' --include='*.tsx' --exclude-dir=messages || echo $k; done`), delete them from all five locales; keys still used by `VenueSpacesPanel`/`GymInstructorPanel`/`VenueDetailClient` stay.
- [ ] **Step 3:** `npx tsc --noEmit -p .`; `npx vitest run` (baseline only); completeness test; `npx eslint` on touched dirs. **Step 4: Commit** `refactor(web): remove partner-gym screens and legacy venue class cards`.

### Task L4: `scripts/cleanup-gym-collections.mjs`

**Spec:** §7. **Files:** create the script.
**Behaviour:** collections `gymSeries, gymSessions, gymBookings, gymSessionMembers, gymScheduleLocks, gymNotifications`; no flags = emulator (`FIRESTORE_EMULATOR_HOST` default `localhost:8080`, project `demo-vfit`); `--project vfit-app-staging` required for a real project and the script hard-fails for any other id, in particular `vfit-funlife`; dry run by default; `--apply` deletes with `recursiveDelete`; prints `collection: before -> after` counts (the `after` of a dry run equals `before`).
- [ ] **Step 1:** seed two docs per collection in the emulator (inline `node -e` with firebase-admin), run `node scripts/cleanup-gym-collections.mjs` -> `gymSeries: 2 -> 2 ...` and the line `dry run - pass --apply to delete`; run with `--apply` -> `... 2 -> 0`; run `--project vfit-funlife` -> exits non-zero with `refusing`. **Step 2: Commit** `chore(scripts): staging-only cleanup of partner-gym collections`.

### Task L5: Remove old docs

**Files:** delete `docs/user-journeys/partner-gym-timetable.md`; modify `docs/README.md` (drop its link, keep the new guide), `docs/features.md`, `docs/database-schema.md`, `docs/api/reference.md`, `docs/backend/cloud-functions.md`, `docs/backend/roles-and-permissions.md` (delete leftover gym-flow sections). Do NOT edit `docs/plans/2026-10-04-business-accounts-plan.md` (the controller maintains P1's log).
- [ ] `grep -rniE "gymSessions|gymBookings|bookGymClass|quoteGym|gym/manage|saveGymSchedule|updateGymSession" docs --include='*.md' -l` lists only specs/plans (history), nothing under `docs/user-journeys`, `docs/api`, `docs/backend`, `docs/features.md`, `docs/database-schema.md`. **Commit** `docs: remove the partner-gym flow documentation`.

### Task L6: Final full verification

- [ ] Functions: `cd functions && npx tsc --noEmit && npm run lint && npm run build` and the full emulator suite. Web: `npx tsc --noEmit -p .`, `npx vitest run` (only the baseline failures, compare by file list), eslint on touched dirs, `npm run build:staging` and `node scripts/check-bundle-budget.mjs`. Record counts in the log.
- [ ] No commit unless a fix is needed.

### Task L7: Staging deploy of the removal, cleanup, regression

- [ ] **Step 1:** `git fetch && git log HEAD..origin/main --oneline`. **Step 2 (order matters):** hosting first (`npm run build:staging && npx firebase deploy -P staging --only hosting`), then functions with the gym callables/trigger removed (`npx firebase deploy -P staging --only functions --force` from a clean worktree if the tree is dirty; confirm the deletion of `saveGymSchedule, updateGymSession, quoteGymBooking, quoteGymTimetable, bookGymClass, cancelGymBooking, recordGymPayment, confirmGymRefund, onGymNotification`), then `npx firebase deploy -P staging --only firestore:rules,firestore:indexes --force` (removes the gym indexes). **Step 3:** `node scripts/cleanup-gym-collections.mjs --project vfit-app-staging` (dry run; counts) then `--apply`; keep the before/after counts. **Step 4:** regression: `node scripts/smoke-unified-courses-staging.mjs` passes; Playwright quick pass (timetable renders, `/gym/manage` is a 404, `/bookings` shows no gym card, owner editor + customer booking still work). **Step 5:** append the removal to the `docs/deployment/staging.md` entry; commit `docs: staging record for gym flow removal`; push.

### Task L8: Production release

- [ ] **Step 1: Preflight.** `npx firebase functions:list -P production | grep -i gym` - expected empty (the gym flow never shipped to prod). If NOT empty: do this task as two deploys (additive first with every step below except function deletion, verify, then the removal commit's functions/rules/indexes deploy). Check what of P1's B11 list is missing on prod (`functions:list -P production | grep -i "syncBusinessVenueLocation\|releaseBusinessVat"`, the `providerKind` indexes are already there; rules) - they ship in this release unless the reconciled business release already deployed them; no `providerType` backfill exists any more; run `backfill-search-tokens.mjs` (providerKind, only if a dry run shows work), `backfill-provider-search.mjs`, `backfill-session-listed.mjs` as dry runs against `--project vfit-funlife` first and `--apply` only the ones with work. `git fetch && git log HEAD..origin/main --oneline` reviewed.
- [ ] **Step 2: Order.** `npx firebase deploy -P production --only firestore:indexes` and wait until none is CREATING; `--only firestore:rules`; functions (the full course list of F5 step 6 plus P1 leftovers, `--force`, clean worktree if dirty); `npm run build:prod && npx firebase deploy -P production --only hosting` (never `build:staging`). Outside the sandbox.
- [ ] **Step 3: Non-mutating verification.** unauthenticated callable `quoteCourse` -> `UNAUTHENTICATED` (deployed); `curl` the public venue query REST call for a real partner venue -> 200 with no documents; Playwright (390x844): `/fit/gyms` lists gyms+schools, `/fit/gyms/timetable?id=<partner venue>` shows the empty week without console errors, `/courses` loads, a provider journey account opens `/provider/courses/create` and sees the venue select only when it manages one. No data is written on prod.
- [ ] **Step 4:** append the prod record (commit, functions, indexes, checks) to `docs/deployment/guide.md`'s release notes section or `docs/deployment/staging.md` follow-up; commit; `git push`.
**Done when:** prod runs the commit, the verification above passes, and no test data was created.

---

## Execution order and log

Execution order is the order of the headings: `0, A1-A7, B1-B5, C1-C4, D1-D7, E1-E5, F1-F6, G1-G6, H1-H4, I1, J1-J3, K1-K3, L1-L8`. F5/F6 deploy and smoke the backend before any UI work because G/H tasks are browser-verified (local dev server, staging backend) as they are built; backend fixes found later are redeployed with `--only functions:<name> --force`.

**Log** (the controller appends one line per finished task: commit hash, test counts, deviations):

- 2026-10-19 - Plan written (spec approved 2026-10-19). No task started.
- 2026-10-20 - Task 0 baseline: functions emulator suites (`src/courses src/partnerGyms test/courses-rules test/partner-gyms-rules`) 64 pass / 0 fail; web `src/components/courses src/types` 33 pass / 0 fail. `session_full` hits before A1: core.ts, integration.test.ts, AddCourseParticipant.tsx + .test.tsx, scripts/smoke-group-courses-staging.mjs (smoke-annual and smoke-course-participants had none).
- 2026-10-20 - Task A1 done: core.test.ts 14 pass (4 new); emulator `src/courses` + courses-rules 50 pass, integration.test.ts 30 pass; full A1 emulator set 68 pass (64 + 4 new); functions tsc + lint clean; root tsc clean; web 33 pass. Deviation: the `lesson_full` rename also covers `AddCourseParticipant.tsx` and its test (client error map), not listed in the task's file list.
- 2026-10-20 - Group A done (A1 `53c017b`). A2 `eda8e41` authority; A3 `9711877` locks; A7 `30b62bf` spaces move (committed before A4); A4 `37e8ca2` enrollInTx commit closure; A5 `2960819` venue authority in operations; A6 `6420404` participant callables by course authority. Group B done: B1 `824bf8e`; B2 `553e520`; B3 `03dd9fd`; B4 `1a94d50`; B5 `5862492`. Review fix `b51b850` (A4/A5 findings): `courses/{id}/customers/{uid}` is created only when absent so later counters survive a re-enrollment; `enroll()` passes the real checkout state to `enrollInTx`; a zero total is always direct/confirmed/paid with no hold and `createCourseCheckout` refuses a zero hold; tests for `cannot_cancel_past_lesson` and `cancellation_deadline`.
- 2026-10-20 - Group C done: C1 `b7b7e3a` pricing; C2 `5999f4e` quote; C3 `ed434d8` priced enrollment and `price_changed`; C4 `e324276` refunds carry courseId/venueId. Group D (first half): D1 `406ee89`, D2 `0c3eda7` (events `waitlist_promoted`, `waitlist_cleared`, `instructor_changed`), D3 `46ee80f`.
- 2026-10-20 - **BC-fix round** (review of B and C, commits `51016e5` `1d2dc30` `761f241` `1ad0bcc` `5efb1f6` `3532824` `2b46c00` `f0ed8bb` `25eb71c`). Findings: (1) archive/unpublish re-validated rooms, instructor links, category and provider eligibility for every target state, so a course with a switched-off room kept its lock slots forever: revalidation now only for a new course, a changed id or a publish (`51016e5`); (2) lock keys joined ids with `_`, which is in the id alphabet, so different triples could share a document: keys are now `room:v:l:r|DAY` / `instructor:i|DAY` (`1d2dc30`); (3) elapsed lessons counted against the 400-lesson cap and could block new slots: `slotsOf(..., since)`, pruning, and the `sweepElapsedLocks` job (`761f241`); (4) a quote could read an unbounded number of lessons: 100-lesson cap on the effective list, lesson-only quotes skip the series, unlinked courses never read instructors, `quoteCourse` rate limited 60 per 10 minutes (`1ad0bcc`); (5) an unlinked course could name any instructor: `course_instructor_not_allowed` (`5efb1f6`); (6) a discount could leave 1-49 cents, a hold Stripe can never charge: `checkout_amount_too_low`, `stripeEligible` on quotes (`3532824`); (7) two vitest processes shared emulator project ids: `testProjectId()` (`2b46c00`); (8) session place and instructor text did not follow the course (`f0ed8bb`); (9) booked-course timezone vs a changed location, `capacity_below_bookings` counted past lessons, `previewCourse` showed instructor conflicts to anyone, terms (`cancellationHours`, `bookingNoticeHours`) did not bump revisions (`25eb71c`).
- 2026-10-20 - Group D done (D4 `e73364f` planner; D5 `b778b5f` promotion on every release; D6 `766d406` standalone promotion and sweep; D7 `ce17579` concurrency suite). Group E done: E1 `c2ac135`; E2 `2735e40`; E3 `148586e`; E4 `bdcb00b`; E5 `2d034ed`. Group F: F1 `009c22c`; F2 `e8dba4c`; F3 `8d8dbfc` (68 indexes); F4 `3a2ac9f`.
- 2026-10-20 - **DE-fix round** (review of D and E, commits `2ee17eb` `97177ac` `e1879eb` `68edde2` `a087ba3` `80df345` `cc8671f`). Findings: (1) the race suite could wait 600 s on a call that never settles: 30 s per-step timeouts, `RACE_ITERATIONS` default 3 (`2ee17eb`); (2) a promoted customer got "accepted" on top of `waitlist_promoted`, whose copy told a confirmed booking to pay within 30 minutes; entries dropped as unpromotable got `waitlist_cleared` ("lesson cancelled"): `waitlist_promoted_hold` added, dropped entries and staff removals get `waitlist_removed` with a reason code, `instructor_changed` shows the reason (`97177ac`); (3) a ghost `waitlisted` counter was never repaired and entries behind a zero counter were stranded: recount in the planner, `reconcile` mode, entry scan in the sweep (`e1879eb`); (4) cancel and reschedule diffed the whole course's locks: only the changed lesson's slot (`68edde2`); (5) planner contention guard for gRPC errors raised inside `enrollInTx` tested (`a087ba3`); (6) cancelled lessons and archived courses stayed `listed`: unlisted in the same transaction, `UNLIST_LIMIT` 300 (`80df345`); (7) an unreadable payment config blocked a customer's cancellation, and a released Stripe hold left its Checkout Session open: checkout counts as off on read failure, the session is expired best effort, three callables bind `STRIPE_SECRET_KEY` (`cc8671f`).
- 2026-10-20 - Tasks F5/F6 done (`d95457b`; deploy of `cc8671f` to `vfit-app-staging`, record in `docs/deployment/staging.md`, "P2 backend staging deploy"): indexes (6 new, all READY), rules, whole-codebase functions deploy (161 functions), listed backfill 0 documents; emulator suites 1818 passed / 0 failed; staging smoke 25 checks passed twice; load checks (400-lesson cancel 18-25 s, 20-way waitlist burst consistent). Fixture `smoke_unified_venue` kept for the browser checks.
- 2026-10-20 - Group G done: G1 `9b48fe9` types, wrappers, hooks, error catalog; G2 `4b082d8` managed venues and navigation; G3 `9cb06f0` VenueSpacesPanel; G4 `1e10db4` InstructorPicker and editor venue cascade; G5 `64ba599` venue-scoped manage courses; G6 `081b662` waitlist, substitute, capacity, remove. Group H done: H1 `3676ee2` weekly venue timetable; H2 `25000c4` priced booking review and waitlist join; H3 `2cb2e42` next lessons on the venue page; H4 `41e0194` waitlist entries in my bookings. Follow-ups after review: `f8f4ce9` (timetable quotes stay inside the quote rate limit), `6744a6e` and `19ca745` (lessons carry `courseName` and `timezone`; listed backfill `--names`).
- 2026-10-20 - Task I1 done (`5cb8f7e`): 131 new keys audited in all five locales (completeness test green, placeholders identical across locales, no raw codes: unknown server codes fall back to `courses.error`). Fixed: de 31 (venue is "Einrichtung" not "Venue"/"Standort", instructor is "Kursleitung", customer-facing errors in "du" like the notification templates, provider-facing kept "Sie"), es 18 (lesson is "lección" in the courses family, matching "Reprogramar lección"; venue "centro" not "sede"), fr 10 (typographic apostrophes, "séance", plain `invalid_space`), it 8 (venue "struttura" not "sede", typographic apostrophes), en 2 (US spelling); server templates: de `instructor_changed` and en `waitlist_cleared` wording. Not done: the 320 px visual check of the longest de/fr labels (needs the browser pass of K2).
- 2026-10-20 - Tasks J1-J3 done: J1 `7d28fbf` (features, database-schema); J2 (API reference, cloud-functions, roles-and-permissions) landed inside `19ca745` because a concurrent `git commit --amend` replaced my commit message, content intact; `d6cf9f0` adds the lesson `courseName`/`timezone` fields; J3 `3cb9573` (group-courses journey rewritten, partner-gym-timetable.md is a stub, README index). `75ee717` adds the "Unified courses hosting deploy" checklist (K1) to `docs/deployment/staging.md`.
