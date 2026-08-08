# Booking End-to-End with Manual Payment Confirmation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client requests a trainer session, the trainer accepts, marks it done, and confirms the off-platform payment — every transition audited, notified in the recipient's language, and enforced server-side.

**Architecture:** All state transitions move behind Cloud Function callables using the Admin SDK; Firestore rules become a deny-by-default backstop rather than the enforcement layer. A single pure `canTransition` guard is shared by every callable. The booking status enum is migrated across the whole collection with a backfilled `statusHistory`. Client and trainer UIs, which currently write Firestore directly, are rewired onto those callables.

**Tech Stack:** Firebase Functions v2 (Node 24, `europe-west1`), Firestore, Resend (transactional email), Next.js App Router (static export) + Zustand, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md`

---

## Conventions (verified against the codebase)

- Server fn pattern: `onCall({ region }, handler)` with `const region = process.env.FIREBASE_REGION || "europe-west1"`.
- Role helpers: `getUserRoleInfo`, `requirePermission` in `functions/src/utils/roles.ts`. Audit: `writeAuditLog` in `functions/src/lib/audit.ts`.
- Functions tests: `functions/` has its own vitest (`npm test` → `vitest run` from `functions/`), setup at `functions/test/setup.ts`. Rules-test precedent: `functions/test/profile-rules.test.ts`.
- App tests: root vitest, jsdom, setup `tests/setup.ts`. E2E: `npx playwright test`.
- i18n: five sibling files `src/i18n/messages/{it,en,es,fr,de}.ts`; `src/i18n/messages/completeness.test.ts` enforces key parity. Italian is authoritative.
- **Static export**: dynamic routes use `?id=` query strings, not path params, for Firestore-backed ids.
- The trainer/venue discriminator throughout is **presence of `instructorId`** on the booking doc.

## Ordering constraints (violating these breaks production)

1. **Task 4 (`createBooking` venue-optional) ships before Task 16 (rules).** Otherwise trainer booking creation fails with `Venue not found`.
2. **Tasks 12–14 (rewiring) ship before Task 16 (rules).** Otherwise client and trainer writes are denied.
3. **Task 11 (migration) runs after Task 10 (scheduled-job amendments) is deployed.** Otherwise 24h reminders break in the gap.

## File structure

| File | Responsibility |
|---|---|
| `functions/src/bookings/transitions.ts` | **Create.** Pure `canTransition` + the four transition callables |
| `functions/src/bookings/payments.ts` | **Create.** `confirmBookingPayment`, `respondToPaymentConfirmation` |
| `functions/src/bookings/migrate.ts` | **Create.** `migrateBookingStatuses` with dry-run |
| `functions/src/bookings/index.ts` | **Modify.** Barrel + existing create/query fns |
| `functions/src/notifications/bookingMessages.ts` | **Create.** 5-locale server catalog + locale resolution |
| `functions/src/lib/email.ts` | **Create.** Resend wrapper, tolerant of an absent secret |
| `functions/src/scheduled/index.ts` | **Modify.** 2 new jobs; amend 3 existing |
| `src/lib/firebase/functions.ts` | **Modify.** Callable wrappers — the only booking write path |
| `src/lib/firebookings.ts` | **Modify.** Drop direct create/cancel writes |
| `src/lib/firebase/provider.ts` | **Modify.** Drop direct status writes |
| `firestore.rules` | **Modify.** Deny client create; deny trainer update |

---

## Task 1: Status enum and booking document types

**Files:**
- Modify: `src/types/firebase.ts:406` (BookingStatus), `:437`, `:467`
- Modify: `src/types/booking.ts`
- Test: `tests/types/bookingStatus.test.ts` (create)

- [ ] **Step 1: Replace the enum**

```ts
// src/types/firebase.ts — replaces line 406
export type BookingStatus =
  | "requested" | "accepted" | "declined"
  | "cancelled_by_client" | "cancelled_by_trainer"
  | "completed" | "no_show" | "payment_confirmed";

export type StatusActorRole = "client" | "trainer" | "admin" | "system";

export interface BookingStatusHistoryEntry {
  status: BookingStatus;
  actorUid: string;
  actorRole: StatusActorRole;
  at: Timestamp;
  note?: string;
}

export type PaymentConfirmationMethod = "cash" | "satispay" | "bank_transfer" | "other";

export interface BookingPaymentConfirmation {
  method: PaymentConfirmationMethod;
  amount: number;
  confirmedByTrainerAt: Timestamp;
  clientResponse: "confirmed" | "disputed" | null;
  clientRespondedAt: Timestamp | null;
  autoConfirmed: boolean;
  disputeReason?: string;
}
```

Add to the `Booking` interface: `statusHistory: BookingStatusHistoryEntry[]`, `lateCancellation?: boolean`, `completionReminderSentAt?: Timestamp | null`, `paymentConfirmation?: BookingPaymentConfirmation | null`. Mirror all of it in `src/types/booking.ts`.

- [ ] **Step 2: Compile to surface every break**

Run: `npx tsc --noEmit`
Expected: FAIL, with errors at each site still using the old vocabulary. **Record the full list — it is the Task 15 worklist.**

- [ ] **Step 3: Commit types only**

```bash
git add src/types/firebase.ts src/types/booking.ts
git commit -m "feat(booking): new status enum, statusHistory and paymentConfirmation types"
```

---

## Task 2: Pure `canTransition` guard (TDD)

**Files:**
- Create: `functions/src/bookings/transitions.ts`
- Test: `functions/test/bookings-transitions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { canTransition } from "../src/bookings/transitions";

const base = {
  userId: "client1", instructorId: "trainer1",
  scheduledAt: new Date("2026-08-10T10:00:00Z"),
  scheduledEndAt: new Date("2026-08-10T11:00:00Z"),
};
const after = new Date("2026-08-10T12:00:00Z");
const before = new Date("2026-08-09T09:00:00Z");

describe("canTransition", () => {
  it("lets the assigned trainer accept a requested booking", () => {
    expect(canTransition({ from: "requested", to: "accepted", actorRole: "trainer",
      actorUid: "trainer1", booking: base, now: before }).ok).toBe(true);
  });

  it("refuses a trainer who is not assigned to the booking", () => {
    const r = canTransition({ from: "requested", to: "accepted", actorRole: "trainer",
      actorUid: "someone_else", booking: base, now: before });
    expect(r.ok).toBe(false);
  });

  it("refuses completion before the session has ended", () => {
    const r = canTransition({ from: "accepted", to: "completed", actorRole: "trainer",
      actorUid: "trainer1", booking: base, now: before });
    expect(r.ok).toBe(false);
  });

  it("allows completion once the end time has passed", () => {
    expect(canTransition({ from: "accepted", to: "completed", actorRole: "trainer",
      actorUid: "trainer1", booking: base, now: after }).ok).toBe(true);
  });

  it("refuses payment confirmation from a non-completed booking", () => {
    const r = canTransition({ from: "accepted", to: "payment_confirmed", actorRole: "trainer",
      actorUid: "trainer1", booking: base, now: after });
    expect(r.ok).toBe(false);
  });

  it("refuses any transition out of a terminal state", () => {
    for (const from of ["declined", "cancelled_by_client", "payment_confirmed", "no_show"] as const) {
      expect(canTransition({ from, to: "accepted", actorRole: "admin",
        actorUid: "admin1", booking: base, now: after }).ok).toBe(false);
    }
  });

  it("lets a client cancel their own booking but not someone else's", () => {
    expect(canTransition({ from: "requested", to: "cancelled_by_client", actorRole: "client",
      actorUid: "client1", booking: base, now: before }).ok).toBe(true);
    expect(canTransition({ from: "requested", to: "cancelled_by_client", actorRole: "client",
      actorUid: "client2", booking: base, now: before }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd functions && npx vitest run test/bookings-transitions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// functions/src/bookings/transitions.ts
import type { BookingStatus, StatusActorRole } from "./types";

const TERMINAL: BookingStatus[] = [
  "declined", "cancelled_by_client", "cancelled_by_trainer", "no_show", "payment_confirmed",
];

const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  requested: ["accepted", "declined", "cancelled_by_client", "cancelled_by_trainer"],
  accepted: ["completed", "no_show", "cancelled_by_client", "cancelled_by_trainer"],
  completed: ["payment_confirmed"],
  declined: [], cancelled_by_client: [], cancelled_by_trainer: [],
  no_show: [], payment_confirmed: [],
};

const TRAINER_ONLY: BookingStatus[] = ["accepted", "declined", "cancelled_by_trainer", "completed", "no_show", "payment_confirmed"];
const CLIENT_ONLY: BookingStatus[] = ["cancelled_by_client"];

export interface TransitionArgs {
  from: BookingStatus;
  to: BookingStatus;
  actorRole: "client" | "trainer" | "admin";
  actorUid: string;
  booking: { userId: string; instructorId?: string | null; scheduledAt: Date; scheduledEndAt: Date };
  now: Date;
}

export function canTransition(a: TransitionArgs): { ok: true } | { ok: false; reason: string } {
  if (TERMINAL.includes(a.from)) return { ok: false, reason: `${a.from} is terminal` };
  if (!ALLOWED[a.from]?.includes(a.to)) return { ok: false, reason: `${a.from} -> ${a.to} not allowed` };

  if (a.actorRole === "client") {
    if (!CLIENT_ONLY.includes(a.to)) return { ok: false, reason: "clients may only cancel" };
    if (a.booking.userId !== a.actorUid) return { ok: false, reason: "not the booking owner" };
  }

  if (a.actorRole === "trainer") {
    if (!TRAINER_ONLY.includes(a.to)) return { ok: false, reason: "not a trainer transition" };
    if (a.booking.instructorId !== a.actorUid) return { ok: false, reason: "not the assigned trainer" };
  }

  // completion and no-show only after the session has actually ended
  if ((a.to === "completed" || a.to === "no_show") && a.now < a.booking.scheduledEndAt) {
    return { ok: false, reason: "session has not ended yet" };
  }

  return { ok: true };
}

/** <24h before the slot counts as a late cancellation (flagged, never charged in the pilot). */
export function isLateCancellation(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Verify green**

Run: `cd functions && npx vitest run test/bookings-transitions.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the late-cancellation boundary test, both sides**

```ts
it("flags a cancellation inside 24h and not one outside it", () => {
  const slot = new Date("2026-08-10T10:00:00Z");
  expect(isLateCancellation(slot, new Date("2026-08-09T10:00:01Z"))).toBe(true);
  expect(isLateCancellation(slot, new Date("2026-08-09T09:59:59Z"))).toBe(false);
});
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/bookings/transitions.ts functions/test/bookings-transitions.test.ts
git commit -m "feat(booking): pure canTransition guard with full transition matrix tests"
```

---

## Task 3: Split `functions/src/bookings/index.ts` (pure refactor)

**Files:**
- Create: `functions/src/bookings/create.ts`, `queries.ts`, `types.ts`
- Modify: `functions/src/bookings/index.ts` → barrel

No behaviour change. Move `createBooking` + its helpers (`fetchBookingResources`, `calculateBookingFinancials`) into `create.ts`; `getBooking`/`listBookings` into `queries.ts`; shared interfaces into `types.ts`. `index.ts` becomes `export * from "./create"; export * from "./queries"; ...`.

- [ ] **Step 1: Move the code, keeping every exported name identical**
- [ ] **Step 2: Verify the build**

Run: `cd functions && npm run build`
Expected: clean. Exported names unchanged, so `functions/src/index.ts` needs no edit.

- [ ] **Step 3: Commit**

```bash
git commit -am "refactor(booking): split bookings/index.ts into create/queries/types modules"
```

---

## Task 4: `createBooking` without a venue (spec §8.0) — **blocks Task 16**

**Files:**
- Modify: `functions/src/bookings/create.ts`
- Test: `functions/test/bookings-create.test.ts`

- [ ] **Step 1: Write the failing test**

Two cases: a venue booking resolves from `venues/{id}/services/{id}`; a trainer booking with no `venueId` resolves from `instructors/{instructorId}/services/{serviceId}` and does **not** throw `Venue not found`. Third case: trainer booking whose service is only in the legacy inline `providerProfile.servicePricing[]` still resolves.

- [ ] **Step 2: Run, confirm failure**

Run: `cd functions && npx vitest run test/bookings-create.test.ts`
Expected: FAIL — `Venue not found`.

- [ ] **Step 3: Implement the branch in `fetchBookingResources`**

```ts
// venueId becomes optional; branch on it
const isTrainerBooking = !venueId && !!instructorId;

const [userDoc, venueDoc, serviceDoc, instructorDoc] = await Promise.all([
  db.collection("users").doc(userId).get(),
  venueId ? db.collection("venues").doc(venueId).get() : Promise.resolve(null),
  isTrainerBooking
    ? db.collection("instructors").doc(instructorId!).collection("services").doc(serviceId).get()
    : db.collection("venues").doc(venueId!).collection("services").doc(serviceId).get(),
  instructorId ? db.collection("instructors").doc(instructorId).get() : Promise.resolve(null),
]);

if (!userDoc.exists) throw new HttpsError("not-found", "User not found");
if (venueId && !venueDoc?.exists) throw new HttpsError("not-found", "Venue not found");

let service: ServiceData | null = serviceDoc.exists ? (serviceDoc.data() as ServiceData) : null;

// PILOT: legacy fallback — older provider docs embed services inline
if (!service && isTrainerBooking) {
  const inline = (instructorDoc?.data()?.providerProfile?.servicePricing ?? [])
    .find((s: { id: string }) => s.id === serviceId);
  if (inline) {
    service = { name: inline.serviceName ?? inline.name ?? "Service", price: inline.price,
      durationMinutes: inline.durationMinutes, description: inline.description } as ServiceData;
  }
}
if (!service) throw new HttpsError("not-found", "Service not found");
```

Make the `venueName` / `venueAddress` denormalization writes conditional on `venueDoc?.exists`. `calculateBookingFinancials` reads only `service.price` — unchanged.

- [ ] **Step 4: Verify green, then commit**

```bash
cd functions && npx vitest run test/bookings-create.test.ts && npm run build
git commit -am "feat(booking): createBooking supports venue-less trainer sessions"
```

---

## Task 5: Server notification catalog + locale resolution (TDD)

**Files:**
- Create: `functions/src/notifications/bookingMessages.ts`
- Test: `functions/test/bookingMessages.test.ts`

- [ ] **Step 1: Failing test — resolution and fallback**

```ts
it("returns the requested locale when supported", () => {
  expect(resolveLocale("es")).toBe("es");
});
it("falls back to Italian for unsupported or absent locales", () => {
  expect(resolveLocale("pt")).toBe("it");
  expect(resolveLocale(undefined)).toBe("it");
});
it("has every transition key in all five locales", () => {
  const keys = Object.keys(BOOKING_MESSAGES.it);
  for (const l of ["en", "es", "fr", "de"] as const) {
    expect(Object.keys(BOOKING_MESSAGES[l]).sort()).toEqual(keys.sort());
  }
});
```

- [ ] **Step 2: Implement**

Catalog shape: `BOOKING_MESSAGES[locale][event] = { title, body }` where `body` is a function of `{ serviceName, amount, trainerName }`. Events: `accepted`, `declined`, `cancelled_by_client`, `cancelled_by_trainer`, `completed`, `payment_confirmed`, `completion_reminder`. Italian written first and translated outward.

- [ ] **Step 3: Green, commit**

```bash
git commit -am "feat(notifications): 5-locale server-side booking message catalog"
```

---

## Task 6: Resend email helper (TDD)

**Files:**
- Create: `functions/src/lib/email.ts`
- Test: `functions/test/email.test.ts`
- Modify: `functions/package.json` (add `resend`)

- [ ] **Step 1: Failing test — must not throw when unconfigured**

```ts
it("no-ops and returns false when RESEND_API_KEY is absent", async () => {
  expect(await sendEmail({ to: "a@b.c", subject: "x", html: "<p>x</p>" })).toBe(false);
});
it("never throws when the provider errors", async () => {
  // mock resend to reject; assert resolves false rather than rejecting
});
```

This matters: per spec §9.2, **email failures must never roll back a status transition.**

- [ ] **Step 2: Implement with `defineSecret("RESEND_API_KEY")`, a shared HTML layout, try/catch returning boolean, and `logger.warn` on failure.**

- [ ] **Step 3: Green, commit**

```bash
cd functions && npm i resend
git commit -am "feat(email): Resend wrapper that degrades gracefully without a key"
```

---

## Task 7: Transition callables

**Files:**
- Modify: `functions/src/bookings/transitions.ts`
- Test: `functions/test/bookings-transitions-callables.test.ts`

Implement `acceptBooking`, `declineBooking`, `cancelBookingAsTrainer`, `completeBooking`; extend `cancelBooking`.

Shared helper `applyTransition()` that: loads the booking → resolves actor role → calls `canTransition` → throws `failed-precondition` on refusal → writes `{status, updatedAt}` + `arrayUnion` the history entry → fans out notifications → `writeAuditLog`.

- [ ] **Step 1: Test `completeBooking` awards points exactly once on `completed` and never on `no_show`** (spec §8 branch table — this is the subtle one)
- [ ] **Step 2: Test that a non-assigned trainer gets `permission-denied`**
- [ ] **Step 3: Implement**, `completed` branch writing `completedAt` + incrementing `pointsBalance` by `pointsEarned` in a transaction; `no_show` writing neither
- [ ] **Step 4: Green, build, commit**

```bash
git commit -am "feat(booking): trainer transition callables with audit trail and notifications"
```

---

## Task 8: Payment callables

**Files:**
- Create: `functions/src/bookings/payments.ts`
- Test: `functions/test/bookings-payments.test.ts`

- [ ] **Step 1: Tests** — `confirmBookingPayment` rejects a non-`completed` booking; rejects a negative or non-finite amount; sets `paymentStatus: "paid"`. `respondToPaymentConfirmation` rejects a caller who is not the booking's client; a `disputed` response stores the reason.
- [ ] **Step 2: Implement.** Amount defaults to `finalPrice` client-side but is **revalidated server-side** (`> 0`, finite).
- [ ] **Step 3: Green, commit**

```bash
git commit -am "feat(booking): payment confirmation and client response callables"
```

---

## Task 9: Register new exports

- [ ] Add `export * from "./bookings/payments";` and `"./bookings/migrate";` to `functions/src/index.ts` (transitions arrives via the bookings barrel). Build, commit.

---

## Task 10: Scheduled jobs — 2 new, 3 amended

**Files:**
- Modify: `functions/src/scheduled/index.ts:41` (`sendBookingReminders`), `:97` (`processCompletedBookings`), and append two jobs
- Modify: `functions/src/notifications/index.ts:293` (`onBookingStatusChange`)
- Test: `functions/test/scheduled-bookings.test.ts`

- [ ] **Step 1: Amend `sendBookingReminders`** — query `"accepted"` not `"confirmed"` (spec §5.2). **Platform-wide regression if missed.**
- [ ] **Step 2: Amend `processCompletedBookings`** — skip docs with an `instructorId`; venue bookings keep auto-completing *and* keep their point award (spec §5.1).
- [ ] **Step 3: Amend `onBookingStatusChange`** — narrow `case "completed"` to `!after.instructorId`; **delete** the now-dead `confirmed` and `cancelled` cases (spec §5.5).
- [ ] **Step 4: Add `remindTrainerToComplete`** — hourly; `accepted` + `scheduledEndAt` ≥2h past + `completionReminderSentAt` unset → notify trainer, stamp the field.
- [ ] **Step 5: Add `autoConfirmPayments`** — hourly; `payment_confirmed` + `clientResponse == null` + `confirmedByTrainerAt` >48h → set `autoConfirmed: true`.
- [ ] **Step 6: Test that points are never awarded twice** for a booking completed by the trainer and then swept by the scheduled job.
- [ ] **Step 7: Green, build, commit, deploy**

```bash
git commit -am "feat(booking): completion reminder + payment auto-confirm jobs; amend legacy jobs for the new enum"
npm run deploy:functions
```

> **Deploy before Task 11.** The migration renames `confirmed`, and the amended reminder query must already be live.

---

## Task 11: Migration callable with dry-run

**Files:**
- Create: `functions/src/bookings/migrate.ts`
- Test: `functions/test/bookings-migrate.test.ts`

- [ ] **Step 1: Test the full mapping table incl. every `cancelledBy` value and its derived `actorRole`**

```ts
const cases = [
  { old: "pending", expected: "requested", role: "system" },
  { old: "confirmed", expected: "accepted", role: "system" },
  { old: "in_progress", expected: "accepted", role: "system" },
  { old: "cancelled", cancelledBy: "user", expected: "cancelled_by_client", role: "client" },
  { old: "cancelled", cancelledBy: "instructor", expected: "cancelled_by_trainer", role: "trainer" },
  { old: "cancelled", cancelledBy: "admin", expected: "cancelled_by_trainer", role: "admin" },
  { old: "cancelled", cancelledBy: "venue", expected: "cancelled_by_trainer", role: "system" },
  { old: "cancelled", cancelledBy: null, expected: "cancelled_by_trainer", role: "system" },
];
```

A uniform `actorRole` here would erase attribution and break the P0-2 trainer metric — spec §7.3.

- [ ] **Step 2: Test idempotency** — running twice leaves docs untouched the second time.
- [ ] **Step 3: Implement.** Superadmin-gated, `{ dryRun: boolean }`, batches of 400, audit-logged, returns per-status counts. Retains `cancelledBy`.
- [ ] **Step 4: Green, build, deploy, then run dry-run against production**

```bash
npm run deploy:functions
# invoke migrateBookingStatuses({ dryRun: true }) and REVIEW THE COUNTS before the live run
```

- [ ] **Step 5: Commit**

---

## Task 12: Callable wrappers in the client layer

**Files:**
- Modify: `src/lib/firebase/functions.ts` (booking wrappers at `:67`, `:89`, `:98` currently have **zero importers**)

- [ ] Add typed wrappers for `acceptBooking`, `declineBooking`, `cancelBookingAsTrainer`, `completeBooking`, `confirmBookingPayment`, `respondToPaymentConfirmation`; update `createBooking`/`cancelBooking` signatures. Commit.

---

## Task 13: Rewire the client write path

**Files:**
- Modify: `src/lib/firebookings.ts:173` (create), `:342` (cancel)
- Modify: `src/stores/bookingStore.ts`

- [ ] **Step 1:** Replace the `writeBatch` create with the `createBooking` callable; delete the local service-resolution block (now server-side, Task 4).
- [ ] **Step 2:** Replace the `updateDoc({status:'cancelled'})` cancel with the callable.
- [ ] **Step 3:** Reconcile field names — `providerId`→`instructorId`, `locationType`→`bookingType`, `duration`→`durationMinutes`, `totalPrice`→`finalPrice`.
- [ ] **Step 4:** `npx tsc --noEmit`, then commit.

---

## Task 14: Rewire the trainer write path

**Files:**
- Modify: `src/lib/firebase/provider.ts:366` (accept), `:389` (complete), `:397` (cancel)

- [ ] Replace all three `updateDoc` status writes with callables. Delete the now-duplicate `cancelBooking` (three implementations collapse to one). `npx tsc --noEmit`, commit.

---

## Task 15: Read-side vocabulary sweep

**Files (known, not exhaustive — use the Task 1 Step 2 list):**
`src/lib/firebase/provider.ts:104,121,717`, `src/components/booking/BookingCard.tsx`, `src/components/provider/BookingTable.tsx`, `src/components/admin/bookings/BookingsListView.tsx`, `.../BookingDetailView.tsx`, `src/app/(main)/bookings/[id]/BookingDetailClient.tsx`

- [ ] **Step 1:** `npx tsc --noEmit` — fix every error.
- [ ] **Step 2:** `grep -rn "'pending'\|'confirmed'\|'in_progress'\|'cancelled'" src/ --include=*.tsx --include=*.ts` — **string comparisons in JSX do not error**, so this grep is mandatory, not optional.
- [ ] **Step 3:** Commit.

---

## Task 16: Firestore rules — **only after Tasks 4, 13, 14**

**Files:**
- Modify: `firestore.rules:350-393`
- Test: `functions/test/booking-rules.test.ts` (pattern: `functions/test/profile-rules.test.ts`)

- [ ] **Step 1: Failing rules tests** — client cannot create; client cannot write `status`; trainer cannot write `status` or `paymentConfirmation`; client can write `userNotes`; owner/trainer/admin can still read.
- [ ] **Step 2: Implement** — remove `allow create` for clients entirely; restrict client update to `['userNotes','updatedAt']`; **remove the trainer update clause at `:384`**; leave read and delete unchanged.
- [ ] **Step 3: Green, deploy, commit**

```bash
npx vitest run functions/test/booking-rules.test.ts
npm run deploy:rules
git commit -am "feat(booking): callable-only transitions; deny client create and trainer status writes"
```

---

## Task 17: Firestore indexes

- [ ] Add to `firestore.indexes.json`: (`status` ASC, `scheduledEndAt` ASC) and (`status` ASC, `paymentConfirmation.confirmedByTrainerAt` ASC). Deploy, commit.

---

## Task 18: i18n — all five locales

**Files:** `src/i18n/messages/{it,en,es,fr,de}.ts`

- [ ] Add keys under `booking.status.*` (8 statuses), `booking.action.*`, `booking.payment.*`, `booking.cancel.lateWarning`, `provider.booking.*`. Italian first, then translate.
- [ ] Run: `npx vitest run src/i18n/messages/completeness.test.ts` — expected PASS. Commit.

---

## Task 19: Client UI

**Files:** `src/app/(main)/bookings/page.tsx`, `src/app/(main)/bookings/[id]/BookingDetailClient.tsx`

- [ ] Status chips for the 8 new statuses; cancel action with the 24h warning; payment-confirmation banner (Confirm / Dispute + reason). 44px minimum targets. Commit.

---

## Task 20: Trainer UI

**Files:** `src/app/(main)/provider/bookings/page.tsx`, `.../[id]/BookingDetailClient.tsx`

- [ ] Accept/Decline with optional message; "Sessione svolta" gated on `now >= scheduledEndAt`, with secondary "No show"; "Pagamento ricevuto" sheet (method radio + amount prefilled from `finalPrice`). Commit.

---

## Task 21: Admin UI

**Files:** `src/components/admin/bookings/BookingsListView.tsx`, `BookingDetailView.tsx`

- [ ] Disputes filter (`paymentConfirmation.clientResponse == "disputed"`); `statusHistory` timeline on detail. Commit.

---

## Task 22: E2E

**Files:** `e2e/booking-flow.spec.ts`

- [ ] Happy path: request → accept → complete → confirm → client confirms. Plus a decline path and a late-cancellation path asserting `lateCancellation: true`.
- [ ] Run: `npx playwright test e2e/booking-flow.spec.ts`. Commit.

---

## Task 23: Browser verification and docs

- [ ] Verify client, trainer and admin screens in the browser (Playwright MCP) — build passing is not sufficient.
- [ ] Update `docs/features.md` checklist and `docs/database-schema.md` with the new fields and collections.
- [ ] Final DoD sweep: `grep -rn "updateDoc.*status" src/` returns nothing for bookings; reminders fire post-migration; points awarded exactly once.
- [ ] Commit.

---

## Definition of done

- [ ] Full flow works on web and an Android build
- [ ] E2E covers request → accept → complete → confirm
- [ ] Rules verified: clients cannot write bookings directly; trainers act only on their own
- [ ] `createBooking` creates trainer sessions without a venue
- [ ] All strings in it/en/es/fr/de; `completeness.test.ts` green
- [ ] `updateBookingStatus`'s `validStatuses` reflects the new enum
- [ ] 24h reminders still fire; loyalty points awarded exactly once
- [ ] `docs/features.md` and `docs/database-schema.md` updated
