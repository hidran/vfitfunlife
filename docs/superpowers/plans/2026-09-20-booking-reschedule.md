# Plan — server-side booking reschedule

*Date:* 2026-09-20. *Replaces:* the disabled client-side reschedule (`RESCHEDULE_TEMPORARILY_DISABLED`).
*Context:* `docs/superpowers/specs/2026-09-19-provider-availability-design.md` → "Known gaps".

## Why

`rescheduleBooking` in `src/lib/firebookings.ts` writes `bookings/{id}` from the browser. Two
things make that impossible: `firestore.rules` lets the owner change only `userNotes`/`updatedAt`,
and the new time was built with `Date.setHours` on the device's clock, so a user outside
Europe/Rome would move the session to the wrong instant. The action is disabled everywhere it
used to appear. This plan replaces it with a callable that validates the new start against the
provider's real availability, exactly as `createBooking` does.

## Shape of the solution

A new `rescheduleBooking` callable that:

- accepts `{ bookingId, startsAt }` where `startsAt` is an ISO instant that came from
  `getProviderSlots` — never a date + "HH:mm" the client assembled itself;
- allows the booking's client, its trainer, or staff (`admin`/`superadmin`);
- refuses unless the booking is active (`requested | accepted` + legacy `pending | confirmed |
  in_progress`) and its current start is in the future;
- validates the new start inside a transaction over the provider-day lock, with the booking
  itself excluded from "busy" (otherwise a booking can never be moved within its own day, and
  the `maxBookingsPerDay` cap counts it twice);
- writes `scheduledAt`, `scheduledEndAt`, `updatedAt` and appends a `rescheduleHistory` entry;
- notifies the counterpart (client ⟷ trainer) through `notifyTransition`.

`getProviderSlots` gains the same `excludeBookingId`, so the picker shows the booking's current
slot as free rather than as taken by itself.

Error codes the client maps to copy: `slot_unavailable`, `not_reschedulable`, plus the standard
`permission-denied` / `not-found`.

## Tasks

### T1 — exclude one booking from a provider-day (slot engine)

Files: `functions/src/availability/dayReads.ts`, `dayContext.ts`, `validate.ts`, `callables.ts`,
and their existing `*.test.ts`.

- `readDayDocs` returns each booking as `{ id: doc.id, ...doc.data() }` (it currently drops the
  id, so nothing downstream can tell which booking is which).
- `busyFrom(bookings, excludeId?)` and `bookingsStartingOn(bookings, date, excludeId?)` skip that
  id; `dayContextFrom(docs, date, excludeBookingId?)` passes it through.
- `validateSlotsRequest` accepts an optional `excludeBookingId` (non-empty string ≤ 128 chars, no
  `/`), and `getProviderSlots` forwards it to `dayContextFrom`.

Tests (vitest, `functions/`): excluded booking no longer blocks its own slot; it stops counting
toward `maxBookingsPerDay`; an unknown id changes nothing; other bookings still block.

### T2 — `rescheduleBooking` callable

Files: `functions/src/bookings/reschedule.ts` (new), re-export from `functions/src/bookings/index.ts`,
`functions/src/notifications/bookingMessages.ts`, `functions/src/bookings/reschedule.test.ts` (new).

Pure, testable core in the same file:

```ts
export type RescheduleRefusal = "not_reschedulable" | "past_booking" | "permission_denied";
export function checkReschedulable(
  booking: { userId?: unknown; instructorId?: unknown; status?: unknown; scheduledAt?: unknown },
  caller: { uid: string; isStaff: boolean },
  now: Date,
): { ok: true } | { ok: false; reason: RescheduleRefusal };
```

Callable body:

1. auth required; load `bookings/{bookingId}` (404 → `not-found`).
2. `checkReschedulable` → `permission-denied` / `failed-precondition` with the reason as message.
3. Parse `startsAt` (ISO, finite, in the future) → `invalid-argument`.
4. Transaction:
   - `readDayDocs(db, instructorId, newDay, tx)` (this also reads the day lock);
   - when the old day differs, read its lock too (reads before writes);
   - `decideBookingStart({ ...dayContextFrom(docs, newDay, bookingId), durationMinutes, now }, newStart)`;
     `!ok` → `failed-precondition "slot_unavailable"`;
   - update the booking: `scheduledAt`, `scheduledEndAt = start + durationMinutes`, `updatedAt`,
     `rescheduleHistory: FieldValue.arrayUnion({ from, to, actorUid, actorRole, at })`;
   - `set(..., { merge: true })` both day locks.
5. After the transaction: `notifyTransition` to the *other* party with a new `rescheduled` event.

`durationMinutes` comes from the booking (`durationMinutes ?? duration ?? 60`), never from the
client.

`bookingMessages.ts`: add `rescheduled` to `BookingMessageEvent` and a template in all five
locales (`bookingMessages.test.ts` already asserts parity).

Tests: each refusal reason; a staff caller passes the permission check; the happy path computes
the right `scheduledEndAt`; `checkReschedulable` treats legacy statuses as active and a past
start as `past_booking`.

### T3 — client: call the server, stop guessing the instant

Files: `src/lib/firebookings.ts`, `src/stores/bookingStore.ts`,
`src/app/(main)/bookings/[id]/reschedule/BookingRescheduleClient.tsx`, `src/lib/firebase/availability.ts`.

- `fetchProviderSlots` / `getProviderAvailability` accept an optional `excludeBookingId`.
- `rescheduleBooking(bookingId, startsAt: string)` becomes a `httpsCallable` wrapper; delete
  `mergeDateAndTime` and the direct `updateDoc`.
- `bookingStore.rescheduleBooking(id, startsAtISO)`; `fetchAvailability(providerId, serviceId,
  date, excludeBookingId?)`.
- The page submits `slot.startsAt` for the selected time and refuses to submit without one (same
  guard as `booking/confirm`); on `slot_unavailable` it refetches the day and shows the error.

Tests: store test that a missing `startsAt` never reaches the callable; the page's submit payload.

**The route itself is unreachable today.** `output: 'export'` forces `dynamicParams = false`, so
`src/app/(main)/bookings/[id]/reschedule` only ever builds `/bookings/placeholder/reschedule/` and
every real id 404s — the same trap `/bookings/detail?id=` already works around. Add
`src/app/(main)/bookings/reschedule/page.tsx` (Suspense + `useSearchParams`, mirroring
`src/app/(main)/bookings/detail/page.tsx` and its comment), have `BookingRescheduleClient` read the
id from `?id=`, delete the dynamic `[id]/reschedule` route, and point both call sites
(`src/app/(main)/bookings/page.tsx:handleReschedule`, `BookingDetailClient`) at the new URL.

### T4 — re-enable the action

Files: `src/lib/bookingStatus.ts`, `src/components/bookings/BookingCard.tsx`,
`src/app/(main)/bookings/[id]/BookingDetailClient.tsx`, the provider booking detail, 5 × `src/i18n/messages/*.ts`.

- Delete `RESCHEDULE_TEMPORARILY_DISABLED` and `wouldBeReschedulable`; `canReschedule(status,
  isPast)` returns `status === 'accepted' && !isPast` again.
- Remove the "temporarily unavailable" note and its message keys; add
  `bookings.reschedule.error.slotUnavailable` and `…notAllowed` in all five locales.
- `src/lib/firebookings.ts:canRescheduleBooking` is dead code — delete it.
- The provider's own "Riprogramma" button (`src/app/(main)/provider/bookings/[id]/BookingDetailClient.tsx`)
  flips a `showRescheduleModal` state that nothing renders: a button that does nothing. Point it at
  the same `/bookings/reschedule/?id=` page (the callable already accepts the trainer as caller) and
  drop the dead state.

### T5 — verify

- `npx vitest run` in `functions/` and the touched `src/` tests; `npx tsc --noEmit`; `npm run lint`.
- Deploy staging (rules unchanged; `functions:rescheduleBooking,getProviderSlots` + hosting).
- Playwright on `vfit-app-staging.web.app`: an accepted booking moves to another free slot, the
  old slot frees up, the new one is taken, an outside-hours instant is refused, and the provider
  sees the new time.
- Then prod, same order.

## Out of scope

- Charging or fees for a late reschedule (the pilot charges nothing).
- A reschedule *request* flow needing the counterpart's approval — either party moves it directly,
  and the other is notified.
- Rescheduling class bookings (`classBookings` is a different collection with its own capacity).
