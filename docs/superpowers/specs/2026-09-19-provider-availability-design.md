# Provider availability — design

Status: approved 2026-09-19

## Problem

Availability does not work anywhere in the booking path.

- `/provider/availability` loads hard-coded defaults (`providerStore.fetchAvailability`
  returns Mon–Fri 09–17 and reads nothing) and saves with `updateDoc(providers/{uid})`.
  The `providers` collection is empty in production, so every save fails.
- Booking reads per-date docs `instructors/{id}/availability/{YYYY-MM-DD}`
  (`getProviderAvailability`, `src/lib/firebookings.ts:146`). Nothing writes them, so it always
  falls back to `generateDefaultTimeSlots()`: every provider is bookable every day, Sundays
  included, 09:00–18:30 in 30-minute slots.
- `createBooking` (`functions/src/bookings/index.ts`) checks neither hours nor overlaps:
  double-booking is possible.
- Weekly hours exist in three shapes: `instructors/{uid}.availabilitySchedule` (flat array,
  seeded by `migrateInstructors` for catalogue providers, read by AI search),
  `users/{uid}.providerProfile.availabilitySchedule` (weekday map, written by the profile
  page's schedule editor, never reaching the catalogue), and the page's
  `AvailabilitySettings.weeklySchedule` (a third map).

## Decisions (user, 2026-09-19)

- Booking **enforces** availability on the server.
- A provider with **no hours is not bookable** until they set them.

## Design

### Data — one source of truth on `instructors/{uid}`

- `availabilitySchedule: { dayOfWeek: 0–6 (0 = Sunday), startTime: 'HH:mm', endTime: 'HH:mm',
  isAvailable: boolean }[]` — the existing canonical array (AI search already reads it via
  `normalizeAvailability`). Several windows per day allowed. Empty or missing ⇒ not bookable.
- `bookingRules: { bufferMinutes, minAdvanceNoticeHours, maxBookingsPerDay }` — defaults
  15 / 24 / 8 when absent.
- Date exceptions: `instructors/{uid}/availability/{YYYY-MM-DD}` —
  `{ isAvailable: boolean, windows: { start: 'HH:mm', end: 'HH:mm' }[], reason?: string }`.
  `isAvailable: false` closes the day; `true` replaces that day's weekly windows with `windows`.
- All times are wall-clock **Europe/Rome** (every provider is in Italy); conversions use
  `date-fns-tz`. No per-provider timezone field.
- Retired: `providers/{uid}.availability`; the profile page's weekly editor (becomes a link to
  `/provider/availability`); `users/{uid}.providerProfile.availabilitySchedule` after migration.

### Slot engine — pure, server-side

`functions/src/availability/slots.ts` — `freeSlots({ schedule, override, rules, busy,
durationMinutes, date, now, stepMinutes = 30 })` → start times `'HH:mm'` for `date`
(Europe/Rome). A start `t` qualifies iff:

1. the day's windows (override if present, else weekly windows for that weekday with
   `isAvailable`) contain `[t, t + duration]` entirely;
2. `t ≥ now + minAdvanceNoticeHours`;
3. `[t − buffer, t + duration + buffer]` overlaps no busy interval;
4. the day's active bookings `< maxBookingsPerDay`.

Busy intervals = the provider's bookings on that date with status in
`requested | accepted | payment_confirmed` (`scheduledAt`–`scheduledEndAt`). It must handle
the DST changeover days in Europe/Rome.

### Server

- `getProviderSlots({ instructorId, serviceId, date: 'YYYY-MM-DD' })` callable (signed-in
  users): reads the instructor doc, the override doc, the service (active, belongs to the
  instructor, gives the duration) and that day's active bookings with the Admin SDK — clients
  cannot read others' bookings — and returns `{ slots: string[] }`.
- `createBooking` enforcement: inside a transaction that reads and writes a server-only lock
  doc `instructors/{id}/bookingDays/{YYYY-MM-DD}` (so concurrent requests for one provider-day
  serialize), recompute `freeSlots` for the requested date/service and reject with
  `HttpsError('failed-precondition', 'slot_unavailable')` if the requested start is not free;
  otherwise create the booking in the same transaction.
- `updateMyAvailability({ schedule, bookingRules, overrides: { upsert: [...], delete: [...] } })`
  callable: caller must be the provider (`providerStatus` verified or pending, or staff);
  validates (HH:mm, start < end, no overlapping windows per day, dayOfWeek 0–6, date format,
  sane rule ranges), writes `instructors/{uid}.availabilitySchedule` + `bookingRules` and the
  override docs with the Admin SDK. (The owner rule on `instructors/{uid}` depends on a `uid`
  field that older providers lack; the callable avoids that gap and validates once.)
- Rules: `bookingDays` server-only (no client read/write). Per-date `availability` docs stay
  publicly readable; client writes to them are no longer needed.
- Migration `backfillAvailability` (superadmin callable, dry-run by default, audited as
  `migration`): for each provider whose `users/{uid}.providerProfile.availabilitySchedule`
  has at least one available window, normalize it to the array and write it to
  `instructors/{uid}.availabilitySchedule` (the provider chose it; it wins over the seeded
  default), then remove the users-side field. Everyone else keeps what they have (seeded
  catalogue providers stay bookable Mon–Fri 09–12/14–18; recent sign-ups stay unbookable
  until they set hours). Report counts.

### Client

- `/provider/availability`: loads the real data (instructor doc + override docs for the next
  12 months), maps it into the existing `AvailabilityEditor`'s `AvailabilitySettings` shape and
  back via a pure adapter, saves through `updateMyAvailability`. With no hours set it opens
  pre-filled Mon–Fri 09:00–18:00 as an **unsaved** draft, with a notice that nothing counts
  until saved.
- `/provider/dashboard`: a banner "Imposta i tuoi orari per ricevere prenotazioni" linking to
  the availability page when `availabilitySchedule` is empty.
- Booking time picker: `bookingStore.fetchAvailability` calls `getProviderSlots` (needs the
  selected service); shows only returned slots; a `slot_unavailable` rejection from
  `createBooking` shows a localized "that time was just taken, pick another" and refetches.
- Profile page: the weekly schedule editor is replaced by a link to `/provider/availability`.
- i18n for every new string in it, en, es, fr, de.

## Testing

Unit: slot engine (windows incl. multiple per day, service fitting before window end, notice,
buffer, overlaps, daily cap, override closed / custom hours, empty schedule, DST days), the
adapter both ways, `updateMyAvailability` validation, `createBooking` availability decision
(pure part), migration normalization. Staging (Playwright, 375px): set hours as the demo
trainer, confirm a customer sees only those slots, book one, confirm the slot disappears for
another customer, and that a direct `createBooking` for an outside-hours or taken slot is
rejected. Production: deploy, run the migration dry-run, report, then apply on the user's go.
