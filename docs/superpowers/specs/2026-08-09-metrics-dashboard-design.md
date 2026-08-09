# Metrics Dashboard ("Cruscotto") — Design Spec

**Date:** 2026-08-09
**Status:** Approved (design) — pending implementation plan
**Author:** Hidran Arias (with Claude Code)
**Priority:** P0-2 — Gate 1 blocker (31 October 2026)
**Depends on:** P0-1 (`2026-08-08-booking-manual-payment-design.md`) — consumes `statusHistory` and `paymentConfirmation`

## 1. Summary

One admin page that answers, at a glance, whether Gate 1 is being met. It is the single
source of truth for the partners' meetings, so every number on it must be defensible.

All aggregation happens in a nightly Cloud Function writing `metrics_daily`. The page reads
those documents and does no heavy computation of its own.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Charts | **Hand-rolled inline SVG.** One trend chart and a progress bar do not justify a ~100KB dependency on a mobile-first static export |
| `dailyStats` | **Replaced.** `aggregateDailyStats` is rewritten to produce `metrics_daily` and stops writing `dailyStats`, which nothing has ever read |
| History | **Backfilled** from existing bookings via a one-shot superadmin callable, same dry-run pattern as the P0-1 status migration |
| Gate targets | Stored in `systemSettings/pilotGates`, not hardcoded — targets and deadlines move |
| Cancellation attribution | **`statusHistory[].actorRole`**, never the status alone |

## 3. Goals & Non-Goals

### Goals
- A superadmin/admin-only `/admin/metrics` page showing Gate 1 progress at a glance.
- Every metric computed server-side, nightly, into `metrics_daily`.
- A per-trainer table that makes inactive trainers obvious.
- Historical data available from day one.

### Non-Goals (YAGNI for the pilot)
- No real-time metrics. Nightly is enough for a weekly partners' meeting.
- No CSV/PDF export, no scheduled email digests.
- No cohort analysis beyond the single rebooking-rate number.
- No Gate 2 tracking — Gate 1 only.
- No per-venue or VFun/VLife breakdown; the pilot is fitness-only.

## 4. The attribution trap (read before implementing any metric)

An admin cancelling a booking writes `status: "cancelled_by_trainer"`, because the enum has
only two cancellation states while `cancelledBy` has five (P0-1 §7.3). **A trainer-reliability
metric that counts `cancelled_by_trainer` will blame trainers for admin cancellations.**

Every cancellation metric therefore reads the last matching `statusHistory` entry and keys on
`actorRole`:

```ts
// trainer-initiated only
h.status === "cancelled_by_trainer" && h.actorRole === "trainer"
```

Backfilled entries carry `actorUid: "migration"` and a derived `actorRole`; venue-initiated
cancellations are indistinguishable from `system` there. Pre-migration cancellations are
therefore **excluded from trainer-reliability** and counted only in the totals.

## 5. Metric definitions

Ambiguity here becomes a wrong number in a partners' meeting, so each is defined exactly.

| Metric | Definition |
|---|---|
| `sessionsRequested` | Bookings whose `statusHistory` contains a `requested` entry dated that day |
| `sessionsAccepted` | …an `accepted` entry dated that day |
| `sessionsCompleted` | …a `completed` entry dated that day |
| `sessionsPaymentConfirmed` | …a `payment_confirmed` entry dated that day |
| `grossValue` | Sum of `paymentConfirmation.amount` for bookings reaching `payment_confirmed` that day. **The amount actually received, not `finalPrice`** — the trainer can edit it, and pilot GMV must reflect reality |
| `activeTrainers` | Distinct `instructorId` with ≥1 `accepted` entry in the trailing 30 days |
| `totalTrainers` | Users with `role == "provider"`, excluding soft-deleted and demo accounts (reuse `isHiddenAccount`) |
| `newClients` | Users with `role == "customer"` created that day |
| `rebookingRate` | Of clients whose **first** `completed` session is ≥30 days old, the share with a second `completed` session within 30 days of the first. Clients whose first session is more recent are excluded — they have not had the chance yet, and including them drags the rate toward zero |
| `medianTimeToAcceptHours` | Median hours between the `requested` and `accepted` entries, over bookings accepted that day. Median, not mean — one trainer on holiday would distort a mean |
| `funnel` | `registeredClients` → `clientsWithRequest` (≥1 booking ever) → `clientsWithCompleted` (≥1 completed ever). Cumulative, not daily |
| `lateCancellations` | Bookings cancelled that day with `lateCancellation == true` |
| `disputes` | Bookings whose `paymentConfirmation.clientResponse == "disputed"`, cumulative |
| `trainerCancellations` | Cancelled that day with `actorRole == "trainer"` — see §4 |

**Timezone: `Europe/Rome`.** A day boundary in UTC would split Italian evening sessions across
two days and make the weekly chart wrong. The existing scheduled jobs already use this zone.

## 6. Data model

### 6.1 `metrics_daily/{YYYY-MM-DD}`

Each document is a **snapshot**: daily event counts plus rolling values as of that date. The
rolling values are duplicated per day on purpose — it makes the trend chart a single range
query instead of a recomputation.

```ts
interface MetricsDaily {
  date: Timestamp;              // start of day, Europe/Rome
  dateKey: string;              // "2026-08-09" — the document id, duplicated for querying

  // Daily events
  sessionsRequested: number;
  sessionsAccepted: number;
  sessionsCompleted: number;
  sessionsPaymentConfirmed: number;
  grossValue: number;
  newClients: number;
  lateCancellations: number;
  trainerCancellations: number;

  // Rolling / cumulative, as of this date
  activeTrainers: number;
  totalTrainers: number;
  cumulativeCompleted: number;
  cumulativePaymentConfirmed: number;
  cumulativeGrossValue: number;
  rebookingRate: number | null;        // null when no eligible cohort yet
  medianTimeToAcceptHours: number | null;
  disputes: number;
  funnel: { registeredClients: number; clientsWithRequest: number; clientsWithCompleted: number };

  // Per-trainer, for the inactive-trainer table. A map, not a subcollection: the pilot has
  // ~20 trainers, so this stays far inside the 1MB document limit.
  byTrainer: Record<string, {
    name: string;
    accepted: number;      // trailing 30d
    completed: number;     // trailing 30d
    paymentConfirmed: number;
    grossValue: number;
    lastAcceptedAt: Timestamp | null;
  }>;

  computedAt: Timestamp;
  backfilled: boolean;       // true when written by the backfill rather than the nightly job
}
```

> **`byTrainer` is capped at 200 entries.** Past that the pilot has outgrown this shape and it
> should move to a subcollection. The function logs when it truncates rather than silently
> dropping trainers — a silently short table would misreport who is inactive.

### 6.2 `systemSettings/pilotGates`

```ts
{
  gate1: {
    deadline: Timestamp;            // 2026-10-31
    targetActiveTrainers: number;   // 20
    targetCompletedSessions: number;// 30  (completed AND paid)
  }
}
```

Seeded with the Gate 1 values; editable by superadmin without a deploy.

## 7. Cloud Functions

`functions/src/metrics/` — a new module, not bolted onto `scheduled/index.ts`, which is
already long.

| File | Responsibility |
|---|---|
| `compute.ts` | **Pure.** Takes bookings + users, returns a `MetricsDaily`. No Firestore, so every definition in §5 is unit-testable |
| `daily.ts` | `aggregateMetricsDaily` — nightly scheduled job |
| `backfill.ts` | `backfillMetricsDaily` — one-shot superadmin callable, `{ dryRun }` defaulting true |
| `index.ts` | Barrel |

`aggregateDailyStats` in `scheduled/index.ts` is **removed**, and its Cloud Scheduler job
deleted, so two jobs do not write overlapping aggregates.

The nightly job recomputes **yesterday and the six days before it** rather than yesterday
alone: a booking completed late, or a client confirming a payment two days on, changes an
earlier day's numbers. Idempotent by construction — each run overwrites the day's document.

## 8. UI — `/admin/metrics`

Admin and superadmin (the existing `/admin` layout already gates this).

- **Gate 1 banner** — green / amber / red against `systemSettings/pilotGates`. Amber when
  behind the linear pace needed to hit the deadline; red when the deadline has passed unmet.
  Shows days remaining.
- **Big-number cards** — "Sessioni completate: 14/30" with a progress bar, "Trainer attivi:
  8/20", pilot GMV, rebooking rate, median time-to-accept.
- **Weekly trend** — hand-rolled inline SVG bars for requested / accepted / completed /
  paid over the last 12 weeks. Accessible: each series has a `<title>`, and the underlying
  numbers are also rendered in a visually-hidden table so the chart is not the only carrier.
- **Per-trainer table** — bookings, completions, confirmations, last activity. Sorted by
  last activity ascending, so **inactive trainers surface at the top** — that is the point
  of the table.
- **Empty state** — if no `metrics_daily` documents exist, say so and point at the backfill,
  rather than rendering zeros that look like real numbers.

Every number displays its as-of date. A stale nightly job showing yesterday's figures as
today's is exactly how a partners' meeting goes wrong.

## 9. Firestore rules

```
match /metrics_daily/{dateKey} {
  allow read: if isAdmin();
  allow write: if false;   // Cloud Functions only, via the Admin SDK
}
```

`systemSettings/pilotGates` follows the existing `systemSettings` rules: admin read,
superadmin write.

## 10. Testing

| Level | Coverage |
|---|---|
| Unit (vitest) | Every §5 definition against fixture data: GMV uses `paymentConfirmation.amount` not `finalPrice`; median time-to-accept with even and odd counts; rebooking rate excludes clients whose first session is <30 days old; **an admin cancellation is not counted as a trainer cancellation**; empty input produces zeros and `null` rates, not `NaN` |
| Integration | Backfill is idempotent — a second run produces identical documents |
| E2E | `/admin/metrics` renders for an admin; redirects for a non-admin |
| Manual | Browser verification, and a spot-check of at least one number against a hand count of the underlying bookings |

## 11. Risks

| Risk | Mitigation |
|---|---|
| **A wrong number is worse than no number** — this drives partner decisions | Every definition pinned in §5; pure compute layer with unit tests; one number hand-verified against raw data before sign-off |
| Existing 16 bookings are seed/demo data, so backfilled history is artificial | `backfilled: true` on those documents, and the UI notes it. Real signal starts with the pilot |
| Rebooking rate is meaningless at pilot scale (a handful of clients) | Rendered as `null` until the eligible cohort reaches a floor (5 clients) rather than showing a swingy percentage |
| Removing `aggregateDailyStats` breaks an unknown consumer | Verified: nothing reads `dailyStats`. The Cloud Scheduler job is deleted in the same change |
| `byTrainer` map outgrows the document | Capped at 200 with a logged warning; escalate to a subcollection past that |

## 12. Definition of done

- `/admin/metrics` renders Gate 1 progress, trend, and the per-trainer table.
- `metrics_daily` populated nightly and backfilled; backfill is idempotent.
- `aggregateDailyStats` and its scheduler job removed.
- All §5 definitions unit-tested, including the admin-vs-trainer cancellation distinction.
- Rules deny all client writes to `metrics_daily`.
- Strings in all five locales; `completeness.test.ts` green.
- One metric hand-verified against the raw bookings.
