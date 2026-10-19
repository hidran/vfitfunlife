# Group courses and activities — proposed design

## Intent and scope

Providers, including trainers, martial arts instructors and gyms, create group courses as services. Customers discover activities and reserve one lesson or the complete course. Direct payment to the provider remains the default. Stripe checkout is implemented but hidden and rejected server-side until a superadmin explicitly enables it. A future customer-selectable VFit escrow mode is represented separately; escrow collection, release and provider payouts are not activated by this change.

Approved for implementation and staging deployment by the user on 2026-10-06.

## Approach

Recommended: keep courses attached to existing provider services and introduce explicit scheduled sessions and enrollments. This preserves the service catalogue while giving every lesson an authoritative capacity record.

Alternatives: extending appointment slots alone couples shared capacity to exclusive appointments and makes series enrollment awkward; reusing the venue course display records alone excludes independent providers and supplies no transactional booking model.

Existing individual services continue to use their current booking flow. The existing venue course display model has no enrollment or payment authority; new bookable courses link to the authoritative course records instead of guessing ownership from legacy records.

## Provider experience

The service editor offers individual service or group course/activity. A group course defines its existing category, name, description, instructor, venue or address, timezone, lesson duration, maximum participants, level and optional equipment requirements. A provider can link an authorized venue; venue identity alone never grants management rights.

Schedule options: one-off, daily, or weekly on selected weekdays, every configurable number of days/weeks. Repeating courses require an end date; annual courses support any selected weekly frequency and daily lessons; there is no 100-session cap. The schedule date span remains bounded to three years. Default timezone is Europe/Rome. Preview exact lesson dates before publishing. Store UTC timestamps generated from local wall-clock times so daylight-saving changes preserve the advertised local time; reject invalid or ambiguous local start times for correction.

Pricing is per participant in EUR: single lesson, complete course, or both. At least one option is required. Providers set booking notice and cancellation deadlines, defaulting to 2 hours and 24 hours respectively. Complete-course enrollment closes when the first lesson starts; joining a series midway uses single-lesson booking if offered. No automatic prorating.

Draft, published and archived states control discovery. Providers can close enrollment, view participant rosters, mark attendance/present/absent and cancel one lesson or the remaining series with a reason. Schedule or price changes affect only unbooked sessions; changing a booked lesson requires an explicit reschedule operation with notification. Capacity cannot fall below occupied plus held seats. Archive rather than delete records with enrollments.

## Customer experience

A courses/group-activities entry in booking discovery supports category, city/location, date and price filters. Published course cards show the provider, next lesson, location, duration, enabled pricing options and remaining places. Detail shows all dated lessons, cancellation terms and any equipment/level requirements. The customer chooses one lesson or the complete series and receives a clear total and lesson list before confirming.

One seat per customer per lesson. Duplicate enrollment is rejected, including overlap between a drop-in and full-course enrollment. Full-course purchase reserves every included session or none if any session is unavailable. Customer bookings show course enrollment and its lessons, payment method/status and cancellation actions. Participant personal information is visible only to the participant and authorized provider/admin, never in public discovery.

## Data and boundaries

- Existing instructor services gain an optional service kind and course reference; absent kind means individual service.
- `courses/{id}` stores provider identity, authorized venue reference, service/category references, public description, schedule rule/timezone, price options, policies, publication state and discovery fields.
- `courses/{id}/sessions/{id}` stores concrete start/end instants, capacity, occupied and held seat counts, instructor/location snapshot and scheduled/cancelled/completed state.
- `courseEnrollments/{id}` stores customer/provider/course references, selected session IDs, lesson/series scope, immutable price and policy snapshot, direct/stripe payment mode, enrollment state and payment reference.
- Private session participant records enforce unique customer/session membership and attendance. Public session records contain counts only.
- Payment records capture amounts in integer minor units, status, Stripe references and processed events. Enrollment/payment history supplies an audit trail.

Cloud Functions own publication, enrollment, cancellation, rescheduling, attendance and payment transitions. Clients cannot write seat counts, price snapshots, participant membership or paid status. Reuse existing auth, provider eligibility, category validation and audited admin settings patterns. Instructor and venue linkage is verified server-side. Rules permit public reads of published eligible courses and sessions, owner reads of private enrollments, and authorized provider/admin roster reads. Indexes support bounded, paginated discovery.

## Seat lifecycle

Transactions validate provider eligibility, publication, dates, price availability, deadlines, duplicate membership and capacity across every selected session before reserving seats. Request IDs make retries idempotent. Direct-payment reservations confirm immediately and occupy seats; providers record full payment using supported direct methods. Payment recording is independent of attendance and must allow advance full-course payment. Partial payments and installments are outside this release.

Stripe enrollment attempts initially hold seats for 30 minutes. Starting Checkout persists an immutable 31-minute expiration and aligns the hold to it, allowing one minute of provisioning slack beyond Stripe's minimum. Checkout expiry, failure or abandonment releases holds exactly once; an expiry worker reconciles overdue attempts. Cancellation releases future occupied seats exactly once. A lesson cancelled by the provider becomes unavailable and affected customers receive notification. Direct payments show a refund-required record for the provider; the application cannot return money paid outside VFit.

## Payments and future escrow

Extend existing `systemSettings/payments` with `courseCheckoutEnabled`, default false. Online course checkout requires both it and `stripePaymentsEnabled`. Existing superadmin-only audited settings UI exposes the new switch. Customers see no online-payment choice while settings are loading, unavailable or disabled. Direct payment remains offered after activation.

Implement Stripe-hosted Checkout through server callables, compatible with static export and Capacitor browser return. The server derives the charge from the immutable enrollment price; clients cannot submit amounts. Creation uses an idempotency key and a validated application return URL. Checkout is card-only in this release to avoid delayed settlement exceeding seat holds. A signed webhook verifies enrollment identity, currency, amount and successful payment before atomically converting held seats into occupied seats. Browser success redirects only refresh state and never mark an enrollment paid.

Webhook retries and out-of-order events cannot duplicate charges, occupancy or refunds. A success arriving after a hold has expired must not overbook: record a payment exception and initiate an idempotent full refund. Switching checkout off blocks new attempts but still processes existing payment/refund events. Provider cancellations of paid lessons create refund operations; partial series refunds allocate the total proportionally across included lessons with deterministic minor-unit rounding. Customer cancellations before the snapshot deadline refund the eligible future lessons; after the deadline, self-service cancellation is blocked. Direct refund obligations use the same calculation but require provider confirmation.

Payment mode types reserve a separate future `vfit_escrow` value, unavailable to customers or API requests now. Stripe checkout does not imply escrow, delayed provider payout or a buyer-protection guarantee. Future escrow requires a separate design covering connected provider accounts, settlement/release rules, disputes, cancellations, fees and per-lesson allocation. Standard Stripe checkout records platform-collected money and provider amounts owed; automated provider payout is outside this release and the admin UI states that explicitly before activation.

## Notifications and additional features

Reuse the existing notification infrastructure for enrollment confirmation, cancellation, reschedule, payment confirmation and upcoming-lesson reminders. Notifications are idempotent and scheduled reminders skip cancelled lessons. Include rosters and attendance in this release. Waitlists, recurring subscriptions, multi-seat family purchases and automatic minimum-participant cancellation are deferred to keep capacity and payment behavior clear.

All new customer/provider/admin copy follows the existing locale completeness requirements (it, en, es, fr, de), responsive components and accessible labelled form patterns.

## Verification

Meaningful tests cover competing last-seat requests, all-or-none series enrollment, duplicate lesson/series membership, retries, capacity reductions, seat release, booking/cancellation deadlines, timezone recurrence and daylight-saving transitions. Rules tests cover unauthorized writes and private roster access. Payment tests cover disabled settings, server-derived prices, signed webhook validation, duplicate/out-of-order events, hold expiry races and idempotent refund allocation.

Browser journeys cover provider creation/publication, discovery, lesson and series reservation, direct payment confirmation, cancellation and attendance. Stripe sandbox verification covers hosted checkout success/failure/abandonment and return into web/mobile. Run frontend and function type checks plus relevant existing booking/settings regressions. Do not deploy, enable payment flags or charge live customers during development.

## Review decisions

User-confirmed: direct payments now; hidden Stripe checkout activated by admin; future customer choice of VFit escrow.

Proposed defaults for review: complete-course enrollment before the first lesson only; annual multi-lesson/daily courses supported; 2-hour booking notice; 24-hour cancellation deadline; 30-minute Stripe holds; attendance and reminders included; waitlist and active escrow deferred.
