# Unified group courses — gyms, schools and individual providers

**Date:** 2026-10-19 · **Status:** approved design, awaiting plan
**Supersedes:** the separate partner-gym timetable flow (`functions/src/partnerGyms`, `gymSessions`, `gymBookings`, `/gym/manage`, `docs/user-journeys/partner-gym-timetable.md`)
**Builds on:** `2026-10-06-group-courses-design.md` (provider courses) and `docs/plans/2026-10-04-business-accounts-plan.md` (businesses as providers)

## 1. Goal

One group-class model for everyone. An individual trainer, a gym or a school publishes a **course** (the class template), the app generates its **lessons** (occurrences), customers book one lesson or the whole course, staff see the roster. Gyms get what gym software provides: a venue with locations and rooms, overlap protection, instructor assignment and substitution, a public weekly timetable, partner discounts, a waitlist and no-show tracking — all on the existing course engine (series purchase, Stripe checkout, invitations, attendance, reminders).

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| U1 | The provider account owns the course: an individual, or a business (`providerType: 'business'`). The business is approved through the business-accounts plan; approval also creates its venue. | One owner, one payee, one roster. No "instructor owns the gym's class" split. |
| U2 | The partner-gym flow is removed, not kept beside courses. | Two booking models for one concept is the bug we are fixing. |
| U3 | Course ↔ venue link is optional. Unlinked courses (individual providers) behave exactly as today. | Nothing regresses for the 11 live providers. |
| U4 | Venue management authority = `venues/{v}.ownerId == uid`, or active `venueStaff/{uid}` for that venue, or admin. The dead `venues/{v}/staff/*` path is deleted. | Flow B's rule, already enforced in `firestore.rules`; Flow A's was never writable. |
| U5 | Partner discounts apply only to venue-linked courses, computed server-side, snapshotted on the enrollment. | Mirrors Flow B's quote; keeps individual-provider prices untouched. |
| U6 | Waitlist with automatic promotion. | Standard in every gym product; removes the last-seat race. |
| U7 | Per-lesson instructor substitution. | Weekly reality in gyms. |
| U8 | Memberships, class packs and credits are **out of scope** (phase 3). Prices stay per lesson / per course. | Separate billing subsystem; the enrollment price snapshot is designed so a pack can pay for a seat later. |
| U9 | Free lessons allowed (`lessonPriceCents` ≥ 0). | Trial classes; Flow B allowed it. |

## 3. Sequencing

Three sub-projects, each with its own plan, staging deploy, smoke test, then prod.

- **P0 — Commit the current tree.** Commit the courses work (staging-verified 2026-10-06) and the partner-gym work as separate commits so P2's removal is a reviewable diff. No functional change.
- **P1 — Business accounts phase 1.** Execute `docs/plans/2026-10-04-business-accounts-plan.md` B1–B11 plus **B12** below.
- **P2 — This spec.** Fold the gym flow into courses.

### Amendments to the business-accounts plan

- **B8:** the venue owner field is `ownerId` (what `src/types/venue.ts`, `functions/src/partnerGyms/store.ts` and the `managesGym` rule already use), not `ownerUid`. The plan's B8 and phase-3 notes are corrected in the same commit that starts P1.
- **`VenueType`** gains `'school' | 'studio'`. A helper `hostsCourses(type)` = `gym | school | studio` replaces every `type === 'gym'` gate (`configureGymInstructor`, the `activePartnerGym` rule, `assertGymManager`, the timetable button). `/fit/gyms` lists all three types (title becomes "Gyms & schools" in five locales); map markers and badges unchanged.

### B12 (added to the business-accounts plan): approval creates the venue

- Company form gains `venueType: 'gym' | 'school' | 'studio' | 'none'` (default `gym`), street address and city (city already present). `none` = the business has no fixed premises (e.g. an animation company) and gets no venue.
- `commitProviderDecision` on approval of a business with `venueType != 'none'` creates `venues/{auto}` in the same transaction: `{name: business.displayName, type, address, city, ownerId: uid, partnerStatus: 'pending', isPartner: false, isActive: true, memberDiscountPercent: 0, partnerInstructorExtraPercent: 0, createdAt}` and writes `instructors/{uid}.business.venueId`. Idempotent: if `business.venueId` is already set, no second venue.
- `venueType` labels in it/en/es/fr/de. Admin venue detail already edits partner status and discounts.
- Done when: approving a company creates one venue owned by it, re-approval creates none, `none` creates none, the venue shows in `/fit/gyms`, and the owner sees it in the course editor's venue picker (P2).

## 4. Data model (P2)

### 4.1 `courses/{courseId}` — added fields

```
venueId:      string | null      # existing; validated against U4
locationId:   string | null      # venues/{v}/locations/{l}; required when venueId set
roomId:       string | null      # venues/{v}/locations/{l}/rooms/{r}; required when venueId set
instructorId: string | null      # registered provider uid; optional
instructor:   string             # existing free text; display fallback when instructorId null
waitlistEnabled: boolean         # default true
lessonPriceCents: number | null  # minimum becomes 0
seriesPriceCents: number | null  # minimum becomes 0 (free trial course)
```

**Frozen once booked** (extends the existing `booked_schedule_locked` list): `venueId`, `locationId`, `roomId`, `instructorId`. Room and instructor changes on a booked course happen per lesson through `manageCourseSession` (`reschedule` accepts an optional `roomId`; `substitute` changes the instructor). Prices stay frozen once booked as today, so a price-driven `revision` bump only ever happens on unbooked courses; capacity changes are allowed and bump `revision`.

Timezone: when `venueId` is set, the course `timezone` is forced to the location's timezone (server overwrites input; UI shows it read-only).

### 4.2 `courses/{id}/sessions/{YYYY-MM-DD}` — added fields

```
revision:      number   # starts 1; +1 on reschedule, capacity change, price change, substitution
instructorId:  string | null   # per-lesson override (substitution); course value otherwise
instructorName: string         # snapshot
roomId, locationId, venueId: snapshots from the course at generation time
waitlisted:    number          # count, denormalised
```

### 4.3 `courses/{id}/sessions/{sid}/waitlist/{uid}`

```
userId, customerName, scope: 'lesson', requestId, paymentMode: 'direct'|'stripe', createdAt, position: number
```

Waitlist is per lesson only (series waitlists are not offered; a full lesson blocks series purchase as today).

### 4.4 `courseEnrollments/{id}` — added fields

```
venueId:        string | null   # denormalised from the course, for rules and staff queries
regularCents:   number    # before discount
discountCents:  number
discountPercent: number   # gym + instructor, capped 100
gymPercent, instructorPercent: number
totalCents:     number    # existing; now = regular − discount
sessionRevisions: {sessionId: number}   # what the customer reviewed
promotedFromWaitlist: boolean
```

`allocations` are stored **post-discount** (series total − discount, allocated per lesson by `allocatePrice`), so the existing per-lesson refund maths in `releaseEnrollment` and `fulfillCourseCheckout` keep working unchanged. `courseRefunds` docs gain `courseId` and `venueId` for the same reason.

### 4.5 `…/participants/{uid}` — added fields

```
lateCancel: boolean   # cancelled after the deadline by staff on the customer's behalf
noShow:     boolean   # attendance == 'absent'
```

### 4.6 `courseScheduleLocks/{key}`

Same shape and keys as Flow B's `gymScheduleLocks`: `room_{venue}_{location}_{room}_{UTCday}` and `instructor_{instructorId}_{UTCday}`, `slots: {[courseId_sessionId]: {start, end}}`. Only published, scheduled sessions hold slots. Instructor locks are taken when `instructorId` is set, regardless of venue. Room locks only for venue-linked courses.

### 4.7 Kept from Flow B unchanged

`venues/{v}/locations/{l}` (+ `rooms`), `venues/{v}/instructors/{i}`, `venueStaff/{uid}`, venue fields `ownerId`, `partnerStatus`, `memberDiscountPercent`, `partnerInstructorExtraPercent`, `instructors/{i}.partnerStatus`, callables `saveGymSpace` and `configureGymInstructor`, admin `GymInstructorPanel` and the venue form fields.

### 4.8 Removed

`functions/src/partnerGyms/`: `schedule.ts`'s `saveGymSpace`/`configureGymInstructor` move to `functions/src/venues/spaces.ts`; the lock helper (`updateScheduleLocks`) and DST probe move into `functions/src/courses/locks.ts`; everything else in the directory is deleted.

Collections `gymSeries`, `gymSessions`, `gymBookings`, `gymSessionMembers`, `gymScheduleLocks`, `gymNotifications`; callables `saveGymSchedule`, `updateGymSession`, `quoteGymBooking`, `quoteGymTimetable`, `bookGymClass`, `cancelGymBooking`, `recordGymPayment`, `confirmGymRefund`; trigger `onGymNotification`; their rules, indexes, `src/types/gym.ts` booking types, `GymManageClient`, `GymBookings`, `/gym/manage`. The staging data in those collections is deleted by a one-off script after P2 deploys (they hold only QA data). Legacy `venues/{v}/courses` display cards and `useVenueCourses` are removed; the venue page shows the timetable instead.

## 5. Backend behaviour

### 5.1 Authority

`canManageCourse(uid, course, tx)` = `uid == course.providerId` ∨ admin ∨ (`course.venueId` ∧ `managesVenue(uid, venueId)`), where `managesVenue` = `venues/{v}.ownerId == uid` ∨ active `venueStaff/{uid}.venueId == v` ∨ admin. Replaces `assertManager` in every course callable that acts on an existing course; each callable resolves authority **once** at entry and passes the result down (no per-participant re-checks). Callables that receive an enrollment or refund id (`cancelCourseEnrollment`, `recordCoursePayment`, `confirmCourseRefund`) load the course through the doc's `courseId` and apply the same check.

Edit: the server keeps `old.providerId` and ignores the client-sent value, so venue staff edit a business-owned course without knowing the owner uid.

New course: `saveCourse` accepts `providerId` = caller (individual or business owner), or, when `venueId` is set and the caller `managesVenue` it, `providerId = venue.ownerId` (venue staff create on the business's behalf; the business stays the owner/payee). Admins may pass any `providerId`. `eligibleProvider` applies to `providerId` as today.

Publishing a venue-linked course requires `venue.isActive && venue.partnerStatus == 'active'`, else `venue_not_active`. Enrollment in a venue-linked course re-checks it.

`enrollCourseParticipant` and `notifyCourseParticipant` gain a `courseId` (the latter replacing its implicit "caller's own roster"); both require a `clients` pair between the customer and the course `providerId`, and the caller must `canManageCourse`. `enrollCourseParticipant` runs the quote but skips the `expectedFinalCents`/`expectedRevisions` check (staff see the live price).

### 5.2 `saveCourse` additions

- Validate `locationId`/`roomId` belong to `venueId` and are active; `instructorId` must be an active `venues/{v}/instructors/{i}` link when venue-linked, or any verified provider otherwise.
- Take room and instructor day locks for every generated published session; on overlap fail `room_overlap` / `instructor_overlap` with the conflicting course name and time. Locks are released for sessions removed or unpublished.
- Snapshot `instructorId`, `instructorName`, `roomId`, `locationId` on sessions; `revision: 1` on new sessions. Price or capacity change bumps `revision` on every scheduled session.

**Lock lifecycle (invariant: a slot exists iff its session is published and scheduled).** Taken on publish and on generation of new sessions; released on unpublish (back to draft), on session `cancel`, on `cancelRemainingCourse`/archive, and for sessions removed by a schedule edit. `reschedule` (optionally with a new `roomId`) and `substitute` release the old slot and take the new one in the same transaction, failing with the overlap error before any write. Same pattern as Flow B's `updateGymSession`.

### 5.3 `quoteCourse({courseId, sessionIds})`

Signed-in. Returns per session `{sessionId, revision, regularCents, discountPercent, discountCents, finalCents, availableSeats, waitlisted}` plus `seriesQuote` with the same fields over all sessions (series price allocated, then discount applied to each allocation). Discount percent as Flow B: `min(100, venue.memberDiscountPercent + (sessionInstructor.partnerStatus == 'active' ? venue.partnerInstructorExtraPercent : 0))`, 0 when no venue. Free lesson → final 0.

### 5.4 `enrollInCourse` additions

Input adds `expectedFinalCents` and `expectedRevisions: {sessionId: revision}`. Inside the transaction the quote is recomputed; any mismatch → `price_changed` with `{reason: 'price' | 'availability'}` (revision-only mismatch, e.g. capacity change, is `availability`; the client shows "availability changed" and re-fetches the quote and re-reviews). Snapshot fields of §4.4 are written. Final 0 → `paymentStatus: 'paid'`, `paymentMode: 'direct'` (Stripe never offered for 0). `enrollCourseParticipant` goes through the same quote (staff-added participants get the discount too).

### 5.5 Waitlist

- `joinCourseWaitlist({courseId, sessionId, paymentMode, requestId})`: lesson full (`occupied + held ≥ capacity`), scheduled, outside the notice window, `waitlistEnabled`, no participant doc for the user, not already waitlisted → waitlist doc with next `position`. `leaveCourseWaitlist({courseId, sessionId})`.
- Promotion: whenever a seat is released on a scheduled session (customer cancel, staff cancel of one participant, hold expiry, late Stripe refund), the same transaction reads the waitlist ordered by `position`, takes the first entry and enrolls it through the existing `enroll()` path with `enrollmentId = sha256(uid:requestId)` from the waitlist doc (idempotent on retry): direct → confirmed/pending payment; stripe → held with a 30-minute `holdExpiresAt` (expiry falls back to the next entry via the existing maintenance worker). **Promotion only if `session.startsAt > now + bookingNoticeHours`**; a seat freed inside the notice window clears the whole waitlist for that lesson with `waitlist_cleared` and the seat goes to walk-in/staff booking. Promotion notification event `waitlist_promoted` (push + email, deep link to pay when Stripe). Capacity increase by staff promotes as many as fit.
- Lesson cancel / reschedule / course archive clears the waitlist with a `waitlist_cleared` notification.
- `nextAvailableSeats` on the course and `waitlisted` on the session are maintained on every join/leave/promote/clear.

### 5.6 `manageCourseSession` additions

- `action: 'reschedule'` additionally accepts `roomId` and bumps `revision` (existing time-change behaviour otherwise unchanged).
- `action: 'substitute'` with `instructorId` (venue link required when venue-linked), takes the instructor day lock, bumps `revision`, notifies confirmed participants (`instructor_changed`).
- new `action: 'removeParticipant'` with `userId` (distinct from `cancel`, which cancels the whole lesson): releases that seat; after the deadline it sets `lateCancel: true` on the participant (no fee).
- `reschedule` keeps the existing `held > 0` refusal (holds are now more frequent because of Stripe promotions).
- `attendance: 'absent'` sets `noShow: true`.
- `action: 'capacity'` with `capacity` (≥ occupied + held) bumps revision and triggers promotion. A `saveCourse` capacity increase does the same for every scheduled session, running promotion per session **after** the course transaction commits.
- Promotion needs `enroll()` split into a transaction-level core `enrollInTx(tx, …)` used by the callable, `enrollCourseParticipant`, and the release paths; this is an explicit plan task (no nested transactions).

### 5.7 Notifications

Outbox stays `courseNotifications`. New events: `waitlist_promoted`, `waitlist_cleared`, `instructor_changed`. Provider-side link for venue courses: `/provider/courses?venue={venueId}`. Notification type stays `course`; `gym_class` and `/bookings?tab=gym` disappear.

### 5.8 Rules

- Courses and their sessions/participants: readers as today; managers per `canManageCourse` expressed in rules with `managesVenue`.
- `courseEnrollments` and `courseRefunds`: readable by `userId`, `providerId`, admin, **or `managesVenue(venueId)`** (field from §4.4), so venue staff see rosters, payments and refunds due.
- `waitlist/{uid}`: readable by that user or a manager; no client writes. Declared as `match /{path=**}/waitlist/{uid}` so the customer's collection-group query works.
- `courseScheduleLocks`: deny all.
- `venues/{v}/staff/*` rule removed.
- Gym collections' rules removed.

### 5.9 Indexes

Remove the three `gymSessions`/`gymBookings` indexes. Add `courses(venueId, state, nextStartsAt)`, collection-group `sessions(venueId, state, startsAt)` (weekly venue grid in one query), collection-group `sessions(instructorId, state, startsAt)` (instructor filter), collection-group `waitlist(userId, createdAt)` (customer's entries).

## 6. Frontend

### 6.1 Course editor (`CourseEditor`)

- **Venue** select: venues the provider manages (owner or staff); "No venue" default. Choosing a venue shows **Location** and **Room** selects (active ones) and sets timezone read-only. Empty location list → inline link "Add locations and rooms" to the venue spaces panel (§6.4).
- **Instructor**: when venue-linked, a select of the venue's linked instructors plus "Other (type a name)" that keeps the free-text field; when unlinked, free text as today with an optional "Link to a registered instructor" typeahead.
- **Waitlist** toggle; price fields accept 0 with helper text "Free".
- Preview shows overlap errors from the server next to the conflicting lesson.

### 6.2 Manage courses (`/provider/courses`)

- `?venue={id}` filters to that venue's courses; venue managers who are not the owner see the same page scoped to the venue (nav entry "Venue courses" in professional mode when the user manages at least one venue).
- Lesson roster: **Waitlist** section (position, name, promote-now button = capacity +1 is not offered; staff may "Remove" an entry), **Substitute instructor** action, **Capacity** action, late-cancel and no-show badges on participants, repeat no-show count per customer in the roster row.
- Venue spaces panel (locations/rooms) moved from `GymManageClient` into a `VenueSpacesPanel` reachable from Manage courses and from the admin venue detail.

### 6.3 Public timetable (`/fit/gyms/timetable?id=`)

Weekly grid: columns Mon–Sun of the selected week, rows by start time, cards coloured by room, filters location / room / instructor. Each card: course name, instructor, time, seats left or "Waitlist", final price (strikethrough regular when discounted). Tap → existing course detail/booking sheet (`CourseBooking`) with the quote. Mobile: day tabs instead of a seven-column grid. Venue page (`/venue?id=`) shows the next three lessons and a "Full timetable" link instead of the legacy classes tab; shows nothing when the venue has no published courses.

### 6.4 Customer bookings

`/courses?tab=bookings` lists enrollments and waitlist entries (with position, Leave button). Promotion with Stripe shows "Pay within 30 min". `/bookings` keeps its existing link.

### 6.5 Navigation

`DashboardModeSwitch`: professional mode also available to users who manage a venue (owner or active staff) and are not providers/admins; it opens `/provider/courses?venue=`. Provider layout `canAccess` extended accordingly, and the provider nav shows only Courses for such users.

## 6.6 Plan ordering constraint

The P2 plan builds and verifies the unified flow on staging first; the removal in §4.8 is the **last** task group, so a rollback path exists until the new flow is proven.

## 7. Migration

- Staging: delete gym collections after deploy (script `scripts/cleanup-gym-collections.mjs`, staging project only, counts before/after).
- Prod: no gym data exists; nothing to migrate. Existing courses get `locationId/roomId/instructorId: null`, `waitlistEnabled: true`, sessions `revision: 1` lazily (server treats missing as 1 / null).
- Seeded `venues/{v}/courses` display cards are left in place but no longer read; the seed stops writing them.

## 8. Error handling

Stable error codes, each with a translated message in five locales: `venue_authorization_required`, `venue_not_active`, `invalid_space`, `invalid_instructor`, `room_overlap`, `instructor_overlap`, `price_changed`, `lesson_full` (with `waitlistAvailable: boolean`), `already_waitlisted`, `waitlist_disabled`. Overlap errors carry `{courseName, startsAt, endsAt}` of the conflict.

## 9. Testing

- Unit (functions): quote math incl. cap and free lessons; lock key generation and overlap detection across courses; promotion order; revision bump matrix.
- Integration (emulator): venue-staff vs owner vs stranger authority; publish blocked on inactive partner; concurrent last seat + waitlist join + promotion on cancel; Stripe promotion hold expiry falls through to next entry; `price_changed` on capacity/price edit between quote and confirm; substitution overlap rejected; staff-added participant receives discount.
- Rules: waitlist read by owner/manager only; lock collection denied; `venues/{v}/staff` no longer special.
- Frontend: editor venue→location→room cascade and read-only timezone; timetable grid renders a week and the day tabs on mobile; booking sheet shows discount and `price_changed` re-review; bookings tab shows waitlist entry.
- Smoke (staging, `scripts/smoke-unified-courses-staging.mjs`): business-owned venue with two rooms, one linked instructor with partner status, overlap rejection, discounted booking, waitlist promotion, substitution, free lesson, cleanup. Playwright at 390×844 it/en: editor with venue, timetable, discounted booking review, waitlist join and promotion.
- Frontend `completeness.test.ts` green for every new key.

## 10. Out of scope

Memberships/packs/credits, late-cancel fees, QR check-in, multi-seat (family) bookings, series waitlists, instructor payroll, Stripe payouts/escrow, non-Italian businesses.
