# Booking End-to-End with Manual Payment Confirmation — Design Spec

**Date:** 2026-08-08
**Status:** Approved (design) — pending implementation plan
**Author:** Hidran Arias (with Claude Code)
**Priority:** P0-1 — Gate 1 blocker (31 October 2026)
**Related:** first of six pilot features; P0-2 (metrics dashboard) consumes the data model defined here

## 1. Summary

A customer requests a session with a trainer, the trainer accepts or declines, the session
happens, and the payment — made **off-platform, directly to the trainer** (cash / Satispay /
bank transfer) — is confirmed in-app so the platform holds a verified record.

The platform **records** payments in this phase; it does not process them. Stripe split
payments are Phase 2 and explicitly out of scope.

This extends the existing booking surface rather than replacing it. `createBooking`,
`getBooking`, `listBookings`, the client `/bookings` screens and the trainer
`/provider/bookings` screens all already exist and are reused.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Status enum | **Migrate** the enum + backfill existing docs (not dual-vocabulary mapping) |
| Migration scope | **Trainer sessions only** govern the new machine; venue bookings get the new vocabulary but keep auto-confirm. `classBookings` untouched |
| Email channel | **Add Resend now** — new dependency, secret, and verified sending domain |
| Notification language | **Localize** via the recipient's `User.preferredLanguage`; server-side catalog, 5 locales |
| Existing hardcoded-Italian notifications | **Left alone** (out of scope; brief forbids unrelated refactoring) |
| Transition authority | **Callable-only.** Firestore rules deny all client/trainer writes to `status` |
| Session type field | Reuse existing `bookingType` (`home_service \| virtual \| outdoor`); keep writing `locationType` for back-compat |
| Client payment confirmation | Optional; **auto-confirms after 48h**. Dispute flags for admin review |
| Cancellation fees | **None in the pilot** — late cancellations are flagged only |

## 3. Goals & Non-Goals

### Goals
- Complete `requested → accepted → completed → payment_confirmed` flow on web + Android.
- Every transition writes an immutable `statusHistory` entry (`status`, `actorUid`, timestamp).
- Trainers can act on their own bookings without admin involvement.
- Clients cannot edit status or amounts; trainers cannot silently edit amounts outside the
  payment-confirmation callable.
- Push + in-app + email notification on every transition, in the recipient's language.
- Late cancellations (<24h) are flagged for data collection.

### Non-Goals (YAGNI for the pilot)
- No Stripe, no split payments, no platform-held funds.
- No cancellation fees or penalties — flag only.
- No dispute *resolution* workflow beyond surfacing disputed bookings to admin.
- No rescheduling changes (existing `/bookings/[id]/reschedule` untouched).
- No changes to `classBookings`.
- No retrofit of pre-existing hardcoded-Italian notifications.

## 4. Existing surface reused

| Asset | Location |
|---|---|
| Booking creation, queries | `functions/src/bookings/index.ts:198` (`createBooking`), `:354`, `:394` |
| Admin status control | `functions/src/bookings/index.ts:646` (`updateBookingStatus`) — admin-only |
| Admin confirm | `functions/src/bookings/index.ts:573` (`confirmBooking`) — requires `bookings:confirm` |
| Push delivery | `functions/src/notifications/index.ts:52` (`sendPushToUser`) |
| Status-change trigger | `functions/src/notifications/index.ts:293` (`onBookingStatusChange`) |
| Migration pattern | `functions/src/ai/migrateInstructors.ts` (dry-run, batched, idempotent) |
| Audit log | `functions/src/lib/audit.ts` (`writeAuditLog`) |
| Role helpers | `functions/src/utils/roles.ts` (`getUserRoleInfo`, `requirePermission`) |
| Booking rules | `firestore.rules:350` |
| Client screens | `src/app/(main)/bookings/`, `src/app/(main)/bookings/[id]/` |
| Trainer screens | `src/app/(main)/provider/bookings/`, `.../[id]/BookingDetailClient.tsx` |
| Locale contract | `src/types/locale.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE = 'it'`) |
| Recipient language | `User.preferredLanguage: AppLocale` (`src/types/firebase.ts`) |

## 5. Conflicts with existing behaviour (must change)

1. **`processCompletedBookings`** (`functions/src/scheduled/index.ts:97`) auto-completes any
   `confirmed` booking 2h after `scheduledEndAt`. The brief requires the *trainer* to mark
   completion. → Amended to skip trainer bookings; venue bookings keep auto-completing.
2. **`confirmBooking`** requires the `bookings:confirm` admin permission, so a trainer cannot
   accept a booking today. → New trainer-scoped callables added; `confirmBooking` retained
   unchanged for admin use.
3. **Firestore rules** currently let the assigned trainer write `status` directly
   (`firestore.rules:384`). → Removed; transitions become callable-only.

## 6. Status machine

```
                    ┌──→ declined ●
requested ──────────┼──→ cancelled_by_client ●
    │               └──→ cancelled_by_trainer ●
    ↓
 accepted ──────────┬──→ cancelled_by_client ●
    │               ├──→ cancelled_by_trainer ●
    ↓               └──→ no_show ●
completed
    ↓
payment_confirmed ●
```

```ts
export type BookingStatus =
  | "requested" | "accepted" | "declined"
  | "cancelled_by_client" | "cancelled_by_trainer"
  | "completed" | "no_show" | "payment_confirmed";
```

`no_show` is retained from the current enum — it is already surfaced in the admin UI and is
useful pilot data. `in_progress` is dropped; nothing writes it meaningfully.

### Transition authority

| From | To | Actor | Guard |
|---|---|---|---|
| — | `requested` | client | own `userId`; `scheduledAt` in the future |
| `requested` | `accepted` | trainer | booking's `instructorId == uid` |
| `requested` | `declined` | trainer | optional `note` |
| `requested` \| `accepted` | `cancelled_by_client` | client | sets `lateCancellation` if <24h |
| `requested` \| `accepted` | `cancelled_by_trainer` | trainer | optional `note` |
| `accepted` | `completed` | trainer | `now >= scheduledEndAt` |
| `accepted` | `no_show` | trainer | `now >= scheduledEndAt` |
| `completed` | `payment_confirmed` | trainer | requires method + amount |

Admin/superadmin may perform any transition (existing `updateBookingStatus`, extended to the
new enum), always audit-logged.

The guard is a **pure function** so it is unit-testable without Firestore:

```ts
// functions/src/bookings/transitions.ts
export function canTransition(args: {
  from: BookingStatus; to: BookingStatus;
  actorRole: "client" | "trainer" | "admin";
  booking: Pick<BookingDoc, "userId" | "instructorId" | "scheduledAt" | "scheduledEndAt">;
  actorUid: string; now: Date;
}): { ok: true } | { ok: false; reason: string };
```

Every callable delegates to it. No transition logic is duplicated at a call site.

## 7. Data model

### 7.1 Booking document — added fields

```ts
statusHistory: Array<{
  status: BookingStatus;
  actorUid: string;
  actorRole: "client" | "trainer" | "admin" | "system";
  at: Timestamp;
  note?: string;
}>;

lateCancellation?: boolean;          // cancelled <24h before scheduledAt
completionReminderSentAt?: Timestamp; // guards the 2h nudge against re-sending

paymentConfirmation?: {
  method: "cash" | "satispay" | "bank_transfer" | "other";
  amount: number;                     // prefilled with totalPrice, trainer-editable
  confirmedByTrainerAt: Timestamp;
  clientResponse: "confirmed" | "disputed" | null;
  clientRespondedAt: Timestamp | null;
  autoConfirmed: boolean;             // true when the 48h job closed it
  disputeReason?: string;
};
```

`statusHistory` is append-only. Callables use `FieldValue.arrayUnion`; rules forbid client and
trainer writes to the field entirely.

### 7.2 Fields deliberately unchanged

- `paymentStatus` remains and flips to `"paid"` on `payment_confirmed`, so existing admin
  payment screens and `aggregateDailyStats` keep working.
- `bookingType` becomes the authoritative session-type field (`home_service | virtual |
  outdoor`). `locationType` keeps being written for back-compat.

> **Known pre-existing divergence:** `bookingType` and `locationType` overlap and have done
> since before this feature. Consolidating them reaches well beyond P0-1 and is deliberately
> **not** attempted here. Marked `// PILOT:` at the write sites.

### 7.3 Migration

One-shot superadmin callable `migrateBookingStatuses`, modelled on
`functions/src/ai/migrateInstructors.ts`: `{ dryRun: boolean }`, batched at 400 docs,
idempotent (skips docs already on the new enum), audit-logged, returns per-status counts.

| Old | New |
|---|---|
| `pending` | `requested` |
| `confirmed` | `accepted` |
| `in_progress` | `accepted` |
| `completed` | `completed` |
| `cancelled` + `cancelledBy == "user"` | `cancelled_by_client` |
| `cancelled` + anything else | `cancelled_by_trainer` |
| `no_show` | `no_show` |

Every migrated doc receives a single synthetic history entry
`{ status, actorUid: "migration", actorRole: "system", at: updatedAt }` so the array is never
empty for downstream consumers.

**Dry-run output is reviewed before the live run.** Applies to the whole `bookings` collection
(venue bookings included) so one vocabulary exists; `classBookings` is not touched.

## 8. Cloud Functions

`functions/src/bookings/index.ts` is ~740 lines today and this work roughly doubles it. It
splits into a directory, with `index.ts` as a re-export barrel so no call site changes:

```
functions/src/bookings/
  index.ts        # barrel — re-exports everything, same public names
  create.ts       # createBooking
  queries.ts      # getBooking, listBookings
  transitions.ts  # canTransition (pure) + accept/decline/cancel/complete callables
  payments.ts     # confirmBookingPayment, respondToPaymentConfirmation
  migrate.ts      # migrateBookingStatuses
```

### New callables

| Callable | Caller | Behaviour |
|---|---|---|
| `acceptBooking` | trainer | `{ bookingId, note? }` → `accepted` |
| `declineBooking` | trainer | `{ bookingId, note? }` → `declined` |
| `cancelBookingAsTrainer` | trainer | `{ bookingId, reason? }` → `cancelled_by_trainer` |
| `completeBooking` | trainer | `{ bookingId, noShow?: boolean }` → `completed` \| `no_show` |
| `confirmBookingPayment` | trainer | `{ bookingId, method, amount }` → `payment_confirmed` |
| `respondToPaymentConfirmation` | client | `{ bookingId, response, disputeReason? }` |

`cancelBooking` (existing) gains client/trainer branching and sets `lateCancellation` when
`scheduledAt - now < 24h`.

### Scheduled functions

| Function | Schedule | Behaviour |
|---|---|---|
| `remindTrainerToComplete` | hourly | `accepted` + `scheduledEndAt` ≥2h past + `completionReminderSentAt` unset → notify trainer, stamp the field |
| `autoConfirmPayments` | hourly | `payment_confirmed` + `clientResponse == null` + `confirmedByTrainerAt` >48h ago → set `autoConfirmed: true` |
| `processCompletedBookings` | *(amended)* | skips bookings with an `instructorId`; venue bookings unchanged |

Both new jobs run in `europe-west1`, `timeZone: "Europe/Rome"`, matching the existing ones.

## 9. Notifications

### 9.1 Message catalog

New `functions/src/notifications/bookingMessages.ts` — a server-side catalog keyed by
transition × locale covering all five locales in `SUPPORTED_LOCALES`. Italian is authoritative;
the others are translations of it. This is separate from `src/i18n/messages/` because that is a
client bundle and Cloud Functions cannot import it.

Transitions with messages: `accepted`, `declined`, `cancelled_by_client`,
`cancelled_by_trainer`, `completed`, `payment_confirmed` (→ client, asking for confirmation),
plus `completion_reminder` (→ trainer).

Recipient language resolves from the recipient's `users/{uid}.preferredLanguage`, falling back
to `DEFAULT_LOCALE` (`"it"`) when absent or unsupported.

### 9.2 Channels

Each transition fans out to three channels:

1. **Push** — existing `sendPushToUser`.
2. **In-app** — a doc in `users/{uid}/notifications`, as today.
3. **Email** — new `functions/src/lib/email.ts` wrapping **Resend**.

Email uses a `RESEND_API_KEY` secret via `defineSecret`, one shared HTML layout, and
subject/body drawn from the same catalog. **Email failures are logged and swallowed** — they
must never roll back or block a status transition.

Client-facing strings for the *UI* still go into all five files under `src/i18n/messages/`; the
existing `completeness.test.ts` enforces parity.

## 10. Firestore rules

`match /bookings/{bookingId}` is tightened:

- **read** — unchanged: owner (`userId`), assigned trainer (`instructorId`), or admin.
- **create** — client only; `userId == request.auth.uid`; `status == "requested"`;
  `statusHistory`, `paymentConfirmation`, `lateCancellation` must be absent. The existing
  `hasOnly([...])` allowlist is updated for the new field names.
- **update** — clients may write only `userNotes` and `updatedAt`. **Trainers get no direct
  update path at all** (today they can write `status` freely — that is how a trainer could
  self-confirm a payment). Admin retains full update.
- **delete** — superadmin only, unchanged.

All state transitions run through callables using the Admin SDK, which bypasses rules. Rules
are therefore a deny-by-default backstop rather than the enforcement layer.

## 11. UI

### Client — `/bookings`, `/bookings/[id]`
- Status chip in the new vocabulary, 5 locales.
- Cancel action with 24h-boundary warning copy ("Cancellazione tardiva" past the boundary).
- Payment-confirmation banner when `paymentConfirmation.clientResponse == null`:
  *"Il trainer ha confermato il pagamento di 45 € — confermi?"* with Confirm / Dispute.
  Dispute opens a short free-text reason.

### Trainer — `/provider/bookings`, `/provider/bookings/[id]`
- Accept / Decline with an optional message, on `requested`.
- "Sessione svolta" primary action once `now >= scheduledEndAt`, with a secondary "No show".
- "Pagamento ricevuto" sheet: method radio group (cash / Satispay / bonifico / altro) plus an
  editable amount prefilled from `totalPrice`.
- All actions are ≥44px touch targets per `docs/design-system.md`.

### Admin — `/admin/bookings`
- A "Disputes" filter (`paymentConfirmation.clientResponse == "disputed"`).
- `statusHistory` timeline on the booking detail view.

## 12. Testing

| Level | Coverage |
|---|---|
| Unit (vitest) | `canTransition` full matrix incl. rejected transitions; 24h late-cancellation boundary (both sides); migration mapping table; locale resolution + fallback for unsupported/absent values |
| Rules | Client cannot write `status`; trainer cannot write `status` or `paymentConfirmation`; client can write `userNotes` |
| E2E (Playwright) | Happy path request → accept → complete → confirm → client confirms; plus a decline path and a late-cancellation path |
| Manual | Browser verification of each screen (client, trainer, admin) per standing project preference |

Firestore composite indexes are added for the two scheduled queries
(`status` + `scheduledEndAt`, and `status` + `paymentConfirmation.confirmedByTrainerAt`).

## 13. Risks & open items

| Risk | Mitigation / owner |
|---|---|
| **Resend account, verified sending domain and GDPR DPA are required before ship** — the one external dependency on the critical path | **Owner: Hidran.** Code is written behind the secret; absent the key, email is skipped and logged, so it does not block the rest of P0-1 |
| Migration runs against production booking data | Dry-run reviewed before live run; idempotent and re-runnable |
| Trainers who never tap "Sessione svolta" stall bookings before `completed` | 2h reminder + per-trainer table in the P0-2 dashboard. No auto-complete, by design |
| Removing the trainer's rules-level `status` write could break an existing client-side call path | Audited during implementation: all trainer status writes must be routed through the new callables |
| `bookingType` / `locationType` divergence persists | Documented above; deliberately deferred |

## 14. Definition of done

- Full flow works on web and an Android build.
- E2E covers request → accept → complete → confirm.
- Rules verified: clients create/cancel only their own; trainers act only on bookings addressed
  to them; amounts and status are not client-editable.
- All new strings present in `it`, `en`, `es`, `fr`, `de`; `completeness.test.ts` green.
- `docs/features.md` checklist and `docs/database-schema.md` updated.
