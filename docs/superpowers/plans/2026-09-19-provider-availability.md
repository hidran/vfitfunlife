# Provider Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Providers set real weekly hours, date exceptions and booking rules; clients see only the times a provider can actually take; the server refuses any booking outside those times or on top of another booking.

**Architecture:** One schedule on `instructors/{uid}` (`availabilitySchedule` array + `bookingRules`) plus per-date exception docs. A pure, Europe/Rome-aware slot engine in `functions/src/availability/slots.ts` is used by a new `getProviderSlots` callable (the booking picker) and by `createBooking` inside a transaction that also takes a provider-day lock doc. A new `updateMyAvailability` callable validates and writes the provider's changes; the existing `AvailabilityEditor` is fed through a pure adapter. A superadmin migration moves the hours the old profile editor wrote.

**Tech Stack:** Firebase Functions v2 (Node 24, `firebase-functions` 7, `firebase-admin` 12, `date-fns-tz` 3), Firestore; Next.js 16 static export with Zustand + TanStack Query; Vitest (v4 in `src/`, v2 in `functions/`).

Spec: `docs/superpowers/specs/2026-09-19-provider-availability-design.md`

## Deviations from the spec

Each one is the closest faithful version of the spec given the code as it is.

1. **`getProviderSlots` returns `{ slots: { time, startsAt }[] }`, not `{ slots: string[] }`.** `time` is the spec's `'HH:mm'`. `startsAt` is the slot's instant (ISO), computed on the server. The web app has no timezone library (`date-fns-tz` is a functions-only dependency), and the confirm page used to build `scheduledAt` from the *device's* local time, so a phone set to another zone would have booked a different instant. The confirm page now sends `startsAt` as `createBooking.scheduledAt`.
2. **`createBooking` enforces availability for trainer sessions only** (`instructorId` set, no `venueId`). Venue bookings take their service from `venues/{id}/services` and have no provider schedule; `getProviderSlots` also only knows instructor services. No client path creates venue bookings today (`firebookings.createBooking` never sends `venueId`).
3. **`slot_unavailable` "refetches" by returning to the picker.** The confirm page (`/booking/confirm`) has no time picker. It shows the localized message plus a "Scegli un altro orario" button that goes back to `/book`, whose picker refetches the day on mount; the store drops a chosen time the server no longer offers.
4. **Profile page:** the 7-day availability preview goes too (it only read the retired `users/{uid}.providerProfile.availabilitySchedule`), and the now-unused `AvailabilityCalendar` component is deleted.
5. **`AvailabilityEditor` gets small functional fixes beyond "adapt data in/out".** The date-exception "custom hours" rows were inert (selects had no `onChange`, the add button did nothing) and are wired up; the timezone `<select>` becomes a fixed Europe/Rome note (spec: no per-provider timezone); a date can have only one exception (the server keys them by date); the exception's date label no longer shows the previous day west of UTC; the icon-only buttons that remove a time range get an `aria-label` and a 44 px target. The page keys the editor on a load counter because the editor copies its props into state once.
6. **`updateMyAvailability` refuses a caller with no `instructors/{uid}` document** (`failed-precondition`, `no_instructor_profile`) instead of creating a bare catalogue entry, and stamps `availabilityUpdatedAt` on the instructor doc.
7. **Migration details the spec left open:** a user whose users-side field has no available window gets the field removed without copying; a user whose instructor doc already has `availabilityUpdatedAt` (hours saved on the new page after deploy, before the migration ran) keeps those hours and only loses the users-side field; legacy windows are cleaned (malformed dropped, overlaps merged) so the provider's next save passes validation; deleted users and users without an instructor doc are skipped and keep the field.
8. **`migrateInstructorCatalog` (and its twin `functions/scripts/migrate-instructor-catalog.mjs`) stop inventing hours.** They wrote `defaultWeeklySchedule()` for any provider with none, so re-running them would make every hourless sign-up bookable Mon–Fri — the opposite of "a provider with no hours is not bookable". They now only normalize a schedule that exists.
9. **Client writes to `instructors/{id}/availability/{date}` are denied** (spec: "no longer needed"), so exceptions only enter through the validating callable. Reads stay public.
10. **`/book` is public but `getProviderSlots` is signed-in only**, so a signed-out visitor who picks a date sees "Accedi per vedere gli orari disponibili" with a sign-in link instead of an empty list.

## Conventions for every task

- Web tests: `npx vitest run <path>` from the repo root. Functions tests: `cd functions && npx vitest run <path>`.
- Typecheck: `npx tsc --noEmit -p .` (web) and `cd functions && npx tsc --noEmit -p .` (functions).
- Lint: web `npx eslint <files>`. Functions **`cd functions && npm run lint`** — plain `npx eslint` inside `functions/` silently ignores files (the legacy config needs `ESLINT_USE_FLAT_CONFIG=false`, which the script sets). Functions rules that bite: max line length 120; `operator-linebreak` "after" (`?`, `:`, `&&`, `||` end a line, never start one); double quotes; `quote-props` consistent-as-needed. `*.test.ts` files are not linted.
- i18n: every new key goes into all five of `src/i18n/messages/{it,en,es,fr,de}.ts` (Italian is the source); `src/i18n/messages/completeness.test.ts` fails otherwise. Values containing an apostrophe use double quotes, all others single quotes (the files' convention).
- Before each commit run `git branch --show-current` (must print `main`) and `git status`; another agent shares this checkout. Stage only the files the task names.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- ~39 web vitest failures are pre-existing (emulator/e2e/rules/home/login). Judge only the tests a task names.
- Nothing is deployed before Task 10. Hosting must never go out ahead of the functions it calls.

## Design notes

- **Time.** Every schedule time is Europe/Rome wall-clock `'HH:mm'`; every comparison is done on real instants (`fromZonedTime`). A wall time that does not exist (spring-forward gap) is never offered; a session on the autumn change day is measured in real minutes. Dates are `'YYYY-MM-DD'` Rome calendar days.
- **Slot grid.** Candidates step 30 minutes from each window's start. A start qualifies iff the session fits inside the window, starts at least `minAdvanceNoticeHours` from now, keeps `bufferMinutes` clear of every active booking on both sides (touching is fine with buffer 0), and the day has fewer than `maxBookingsPerDay` active bookings. Active = `requested | accepted | payment_confirmed`.
- **Busy query.** Bookings with `instructorId == id` and `scheduledAt` in `[Rome day start, next day start)`, ordered `scheduledAt desc` so it uses the existing `(instructorId ASC, scheduledAt DESC)` composite index. Statuses are filtered in code, so no new index. A booking that starts the previous evening and runs past midnight is not seen; windows cannot cross midnight, so it only matters for a provider working right after 00:00.
- **Concurrency.** `createBooking` reads `instructors/{id}/bookingDays/{date}` (plus the instructor, the exception and the day's bookings) inside its transaction and writes it before creating the booking. Two requests for one provider-day therefore conflict; Firestore retries the loser, which re-reads the bookings and gets `slot_unavailable`.
- **Validation ranges** (`updateMyAvailability`): `bufferMinutes` integer 0–120, `minAdvanceNoticeHours` 0–168, `maxBookingsPerDay` 1–50; times `HH:mm` 00:00–23:59, start < end; no overlapping *available* windows on a day (touching allowed); ≤ 10 windows per day; `dayOfWeek` 0–6; real calendar dates; ≤ 400 exception writes per save (one batch). Stored rules outside these ranges fall back to the defaults 15 / 24 / 8.
- **Draft.** A provider whose `availabilitySchedule` is missing or empty opens the page on an unsaved Mon–Fri 09:00–18:00 proposal with a notice; nothing is written until they press save.

## File map

| File | Responsibility |
|---|---|
| `functions/src/availability/slots.ts` (new) | pure slot engine, Rome date/time helpers, `decideBookingStart` |
| `functions/src/availability/dayContext.ts` (new) | pure: raw instructor / exception / booking docs → engine input |
| `functions/src/availability/dayReads.ts` (new) | Admin SDK reads for one provider-day (optionally in a transaction); `bookingDayRef` |
| `functions/src/availability/validate.ts` (new) | pure input validation for both callables; provider access check |
| `functions/src/availability/callables.ts` (new) | `getProviderSlots`, `updateMyAvailability` |
| `functions/src/availability/backfillPlan.ts` (new) | pure migration decision per user; legacy schedule cleaning |
| `functions/src/availability/backfill.ts` (new) | `backfillAvailability` superadmin callable |
| `functions/src/availability/index.ts` (new), `functions/src/index.ts` | exports |
| `functions/src/bookings/index.ts` | `createBooking` availability check + provider-day lock |
| `functions/src/ai/migrateInstructors.ts`, `functions/scripts/migrate-instructor-catalog.mjs` | stop seeding default hours |
| `firestore.rules` | `bookingDays` server-only; `availability` client writes denied |
| `src/lib/availability/dates.ts` (new) | date keys without a tz library |
| `src/lib/availability/adapter.ts` (new) | stored availability ↔ `AvailabilitySettings` |
| `src/lib/availability/errors.ts` (new) | callable error → user message |
| `src/lib/firebase/availability.ts` (new) | client reads + callable wrappers |
| `src/lib/firebookings.ts`, `src/stores/bookingStore.ts`, `src/types/booking.ts` | picker reads `getProviderSlots` |
| `src/components/booking/AvailabilityPicker.tsx`, `src/app/book/BookingClient.tsx`, `src/app/(main)/bookings/[id]/reschedule/BookingRescheduleClient.tsx`, `src/app/(main)/booking/confirm/page.tsx` | picker UI, sign-in notice, `startsAt`, slot-taken UX |
| `src/stores/providerStore.ts`, `src/lib/firebase/provider.ts`, `src/lib/firebase/index.ts` | availability load/save through the adapter; old `providers/{uid}` write removed |
| `src/app/(main)/provider/availability/page.tsx`, `src/components/provider/AvailabilityEditor.tsx` | real data, draft notice, save feedback, editor fixes |
| `src/components/provider/NoHoursBanner.tsx` (new), `src/app/(main)/provider/dashboard/page.tsx` | "set your hours" banner |
| `src/app/(main)/profile/page.tsx`, `src/components/profile/index.ts`, `src/components/profile/AvailabilityCalendar.tsx` (deleted) | profile link replaces the old editor |
| `src/i18n/messages/{it,en,es,fr,de}.ts` | new strings |

---

### Task 1: Slot engine and day context (pure)

**Files:**
- Create: `functions/src/availability/slots.ts`
- Create: `functions/src/availability/dayContext.ts`
- Test: `functions/src/availability/slots.test.ts`, `functions/src/availability/dayContext.test.ts`

- [ ] **Step 1: Write the failing tests** — `functions/src/availability/slots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  freeSlots,
  romeDayBounds,
  romeInstant,
  isDateKey,
  DEFAULT_BOOKING_RULES,
  type SlotQuery,
  type WeeklyWindow,
} from "./slots";

// 2026-09-21 is a Monday (dayOfWeek 1). Rome is UTC+2 in September.
const MONDAY = "2026-09-21";
const LONG_AGO = new Date("2026-01-01T00:00:00Z");
const NO_RULES = { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 8 };

const mon = (startTime: string, endTime: string, isAvailable = true): WeeklyWindow =>
  ({ dayOfWeek: 1, startTime, endTime, isAvailable });

function q(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    schedule: [mon("09:00", "12:00")],
    override: null,
    rules: NO_RULES,
    busy: [],
    durationMinutes: 60,
    date: MONDAY,
    now: LONG_AGO,
    ...overrides,
  };
}

const at = (time: string, date = MONDAY) => romeInstant(date, time);

describe("freeSlots", () => {
  it("offers every 30-minute start whose session ends inside the window", () => {
    expect(freeSlots(q())).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("merges several windows on one day", () => {
    const schedule = [mon("09:00", "10:00"), mon("14:00", "15:30")];
    expect(freeSlots(q({ schedule }))).toEqual(["09:00", "14:00", "14:30"]);
  });

  it("ignores windows marked unavailable and other weekdays", () => {
    const schedule = [mon("09:00", "12:00", false), { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" }];
    expect(freeSlots(q({ schedule }))).toEqual([]);
  });

  it("is empty when the provider has no hours at all", () => {
    expect(freeSlots(q({ schedule: [] }))).toEqual([]);
  });

  it("drops starts inside the minimum advance notice", () => {
    const now = new Date("2026-09-20T08:00:00Z"); // Sunday 10:00 Rome; +24h = Monday 10:00
    const rules = { ...NO_RULES, minAdvanceNoticeHours: 24 };
    expect(freeSlots(q({ now, rules }))).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("keeps a buffer on both sides of an existing booking", () => {
    const busy = [{ start: at("10:00"), end: at("11:00") }];
    const rules = { ...NO_RULES, bufferMinutes: 15 };
    // 09:00 would end at 10:00 — within 15' of the booking; 11:00 would start 0' after it.
    expect(freeSlots(q({ busy, rules, schedule: [mon("08:00", "13:00")] })))
      .toEqual(["08:00", "08:30", "11:30", "12:00"]);
  });

  it("lets back-to-back sessions touch when there is no buffer", () => {
    const busy = [{ start: at("10:00"), end: at("11:00") }];
    expect(freeSlots(q({ busy }))).toEqual(["09:00", "11:00"]);
  });

  it("offers nothing once the day holds maxBookingsPerDay active bookings", () => {
    const busy = [{ start: at("07:00"), end: at("08:00") }];
    expect(freeSlots(q({ busy, rules: { ...NO_RULES, maxBookingsPerDay: 1 } }))).toEqual([]);
  });

  it("an override that closes the day wins over the weekly hours", () => {
    expect(freeSlots(q({ override: { isAvailable: false, windows: [] } }))).toEqual([]);
  });

  it("an override with custom hours replaces the weekly hours", () => {
    const override = { isAvailable: true, windows: [{ start: "15:00", end: "16:30" }] };
    expect(freeSlots(q({ override }))).toEqual(["15:00", "15:30"]);
  });

  it("an override opens a day the weekly schedule keeps closed", () => {
    const override = { isAvailable: true, windows: [{ start: "10:00", end: "11:00" }] };
    expect(freeSlots(q({ date: "2026-09-20", override }))).toEqual(["10:00"]);
  });

  it("uses the service duration: a 90-minute session needs 90 free minutes", () => {
    expect(freeSlots(q({ durationMinutes: 90 }))).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("returns nothing for a non-positive duration", () => {
    expect(freeSlots(q({ durationMinutes: 0 }))).toEqual([]);
  });

  it("skips the hour that does not exist when clocks go forward (2026-03-29)", () => {
    // Sunday 01:00–04:00 wall clock is only two real hours: 02:00–02:59 never happens.
    const schedule = [{ dayOfWeek: 0, startTime: "01:00", endTime: "04:00" }];
    expect(freeSlots(q({ schedule, date: "2026-03-29" }))).toEqual(["01:00", "01:30", "03:00"]);
  });

  it("measures a session in real time when clocks go back (2026-10-25)", () => {
    // Sunday 01:00–03:00 wall clock lasts three real hours (02:xx happens twice), so a
    // 120-minute session also fits from 01:30. Wall-clock arithmetic would allow only 01:00.
    const schedule = [{ dayOfWeek: 0, startTime: "01:00", endTime: "03:00" }];
    expect(freeSlots(q({ schedule, date: "2026-10-25", durationMinutes: 120 })))
      .toEqual(["01:00", "01:30"]);
  });
});

describe("date helpers", () => {
  it("knows a real calendar date from a lookalike", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-9-1")).toBe(false);
  });

  it("gives DST days their real length", () => {
    const spring = romeDayBounds("2026-03-29");
    const autumn = romeDayBounds("2026-10-25");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it("has the documented defaults", () => {
    expect(DEFAULT_BOOKING_RULES).toEqual({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });
});
```

and `functions/src/availability/dayContext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { busyFrom, dayContextFrom, parseOverride, resolveRules } from "./dayContext";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("resolveRules", () => {
  it("defaults to 15 / 24 / 8 when absent", () => {
    expect(resolveRules(undefined)).toEqual({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });

  it("keeps valid values and replaces out-of-range ones", () => {
    expect(resolveRules({ bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 0 }))
      .toEqual({ bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 8 });
  });
});

describe("parseOverride", () => {
  it("reads a closed day", () => {
    expect(parseOverride({ isAvailable: false, windows: [], reason: "Ferie" }))
      .toEqual({ isAvailable: false, windows: [] });
  });

  it("keeps only well-formed windows", () => {
    expect(parseOverride({
      isAvailable: true,
      windows: [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "12:00" }, { start: "x" }],
    })).toEqual({ isAvailable: true, windows: [{ start: "10:00", end: "12:00" }] });
  });

  it("treats a missing or foreign-shaped doc as no override", () => {
    expect(parseOverride(undefined)).toBeNull();
    expect(parseOverride({ slots: [{ start: "09:00", isBooked: true }] })).toBeNull();
  });
});

describe("busyFrom", () => {
  it("counts only active bookings", () => {
    const busy = busyFrom([
      { status: "requested", scheduledAt: ts("2026-09-21T08:00:00Z"), scheduledEndAt: ts("2026-09-21T09:00:00Z") },
      { status: "accepted", scheduledAt: ts("2026-09-21T10:00:00Z"), scheduledEndAt: ts("2026-09-21T11:00:00Z") },
      { status: "payment_confirmed", scheduledAt: ts("2026-09-21T12:00:00Z"), scheduledEndAt: ts("2026-09-21T13:00:00Z") },
      { status: "declined", scheduledAt: ts("2026-09-21T14:00:00Z"), scheduledEndAt: ts("2026-09-21T15:00:00Z") },
      { status: "cancelled_by_client", scheduledAt: ts("2026-09-21T15:00:00Z") },
      { status: "completed", scheduledAt: ts("2026-09-21T16:00:00Z") },
    ]);
    expect(busy.map((b) => b.start.toISOString())).toEqual([
      "2026-09-21T08:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
      "2026-09-21T12:00:00.000Z",
    ]);
  });

  it("falls back to start + durationMinutes when the end is missing", () => {
    const [b] = busyFrom([{ status: "accepted", scheduledAt: ts("2026-09-21T08:00:00Z"), durationMinutes: 45 }]);
    expect(b.end.toISOString()).toBe("2026-09-21T08:45:00.000Z");
  });
});

describe("dayContextFrom", () => {
  it("assembles schedule, override, rules and busy from the raw docs", () => {
    const ctx = dayContextFrom({
      instructor: {
        availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
        bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      },
      override: undefined,
      bookings: [],
    });
    expect(ctx).toEqual({
      schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isAvailable: true }],
      override: null,
      rules: { bufferMinutes: 0, minAdvanceNoticeHours: 0, maxBookingsPerDay: 3 },
      busy: [],
    });
  });

  it("gives a provider with no instructor doc no hours", () => {
    expect(dayContextFrom({ instructor: undefined, override: undefined, bookings: [] }).schedule).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/availability` — expect FAIL (modules not found).

- [ ] **Step 3: Implement** — `functions/src/availability/slots.ts`:

```ts
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { AvailabilitySlot } from "../ai/search/match";

/** Every provider is in Italy: all availability is wall-clock time in this zone. */
export const ROME = "Europe/Rome";

export type WeeklyWindow = AvailabilitySlot;

export interface TimeWindow {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** instructors/{id}/availability/{YYYY-MM-DD}. isAvailable false closes the day. */
export interface DateOverride {
  isAvailable: boolean;
  windows: TimeWindow[];
  reason?: string;
}

export interface BookingRules {
  bufferMinutes: number;
  minAdvanceNoticeHours: number;
  maxBookingsPerDay: number;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  bufferMinutes: 15,
  minAdvanceNoticeHours: 24,
  maxBookingsPerDay: 8,
};

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  schedule: WeeklyWindow[];
  override: DateOverride | null;
  rules: BookingRules;
  /** The provider's active bookings that start on `date`. */
  busy: BusyInterval[];
  durationMinutes: number;
  date: string; // "YYYY-MM-DD", Europe/Rome
  now: Date;
  stepMinutes?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isTimeKey(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The instant a Rome wall-clock time happens. Nonexistent times (spring-forward gap) shift. */
export function romeInstant(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, ROME);
}

export function romeDateOf(instant: Date): string {
  return formatInTimeZone(instant, ROME, "yyyy-MM-dd");
}

export function romeTimeOf(instant: Date): string {
  return formatInTimeZone(instant, ROME, "HH:mm");
}

/** [start of `date`, start of the next day) in Rome, as instants. 23 or 25 hours on DST days. */
export function romeDayBounds(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: romeInstant(date, "00:00"), end: romeInstant(next, "00:00") };
}

/** 0 = Sunday … 6 = Saturday, like WeeklyWindow.dayOfWeek. */
export function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The day's windows: the override's when there is one, else the weekly ones for that weekday. */
export function windowsFor(schedule: WeeklyWindow[], override: DateOverride | null, date: string): TimeWindow[] {
  if (override) return override.isAvailable ? override.windows : [];
  const dow = dayOfWeekOf(date);
  return schedule
    .filter((w) => w.dayOfWeek === dow && w.isAvailable !== false)
    .map((w) => ({ start: w.startTime, end: w.endTime }));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Start times ("HH:mm", Rome) a new booking of `durationMinutes` can take on `date`.
 *
 * A start t qualifies iff: some window contains [t, t + duration]; t is at least
 * minAdvanceNoticeHours after `now`; [t − buffer, t + duration + buffer] overlaps no busy
 * interval; and the day holds fewer than maxBookingsPerDay active bookings.
 *
 * Candidates step from each window's start. Everything is compared as real instants, so a
 * DST day's missing or repeated hour is handled: a wall time that does not exist is skipped.
 */
export function freeSlots(q: SlotQuery): string[] {
  if (!(q.durationMinutes > 0)) return [];
  if (q.busy.length >= q.rules.maxBookingsPerDay) return [];

  const step = q.stepMinutes ?? 30;
  const durationMs = q.durationMinutes * 60_000;
  const bufferMs = q.rules.bufferMinutes * 60_000;
  const earliest = q.now.getTime() + q.rules.minAdvanceNoticeHours * 3_600_000;
  const busy = q.busy.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));
  const out = new Set<string>();

  for (const w of windowsFor(q.schedule, q.override, q.date)) {
    const windowEnd = romeInstant(q.date, w.end).getTime();
    for (let m = toMinutes(w.start); m < toMinutes(w.end); m += step) {
      const time = fromMinutes(m);
      const start = romeInstant(q.date, time);
      if (romeTimeOf(start) !== time) continue; // skipped by the spring-forward gap
      const s = start.getTime();
      const e = s + durationMs;
      if (e > windowEnd) break;
      if (s < earliest) continue;
      if (busy.some((b) => overlaps(s - bufferMs, e + bufferMs, b.start, b.end))) continue;
      out.add(time);
    }
  }
  return [...out].sort();
}
```

`functions/src/availability/dayContext.ts`:

```ts
import { normalizeAvailability } from "../ai/search/normalize";
import type { BookingStatus } from "../bookings/types";
import {
  DEFAULT_BOOKING_RULES,
  isTimeKey,
  type BookingRules,
  type BusyInterval,
  type DateOverride,
  type SlotQuery,
  type TimeWindow,
} from "./slots";

/** A booking in one of these holds its time. Every other status frees it. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ["requested", "accepted", "payment_confirmed"];

type Doc = Record<string, unknown>;
type TimestampLike = { toDate: () => Date };

/** The raw documents one provider-day needs. */
export interface DayDocs {
  instructor: Doc | undefined;
  override: Doc | undefined;
  bookings: Doc[];
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return typeof v === "object" && v !== null && typeof (v as TimestampLike).toDate === "function";
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** bookingRules with defaults for anything absent or out of range. */
export function resolveRules(raw: unknown): BookingRules {
  const r = (raw ?? {}) as Doc;
  return {
    bufferMinutes: intIn(r.bufferMinutes, 0, 120, DEFAULT_BOOKING_RULES.bufferMinutes),
    minAdvanceNoticeHours: intIn(r.minAdvanceNoticeHours, 0, 168, DEFAULT_BOOKING_RULES.minAdvanceNoticeHours),
    maxBookingsPerDay: intIn(r.maxBookingsPerDay, 1, 50, DEFAULT_BOOKING_RULES.maxBookingsPerDay),
  };
}

/** An override doc, or null when there is none (or it is not in the current shape). */
export function parseOverride(raw: Doc | undefined): DateOverride | null {
  if (!raw || typeof raw.isAvailable !== "boolean") return null;
  const windows = Array.isArray(raw.windows) ?
    (raw.windows as Doc[])
      .filter((w) => isTimeKey(w?.start) && isTimeKey(w?.end) && (w.start as string) < (w.end as string))
      .map((w): TimeWindow => ({ start: w.start as string, end: w.end as string })) :
    [];
  return { isAvailable: raw.isAvailable, windows };
}

/** Active bookings as busy intervals. A missing end falls back to start + duration. */
export function busyFrom(bookings: Doc[]): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const b of bookings) {
    if (!ACTIVE_BOOKING_STATUSES.includes(b.status as BookingStatus)) continue;
    if (!isTimestampLike(b.scheduledAt)) continue;
    const start = b.scheduledAt.toDate();
    const minutes = Number(b.durationMinutes ?? b.duration ?? 60) || 60;
    const end = isTimestampLike(b.scheduledEndAt) ?
      b.scheduledEndAt.toDate() :
      new Date(start.getTime() + minutes * 60_000);
    out.push({ start, end });
  }
  return out;
}

/** Everything freeSlots needs except the duration, the date and the clock. */
export function dayContextFrom(docs: DayDocs): Pick<SlotQuery, "schedule" | "override" | "rules" | "busy"> {
  return {
    schedule: normalizeAvailability(docs.instructor?.availabilitySchedule),
    override: parseOverride(docs.override),
    rules: resolveRules(docs.instructor?.bookingRules),
    busy: busyFrom(docs.bookings),
  };
}
```

- [ ] **Step 4: Run** `cd functions && npx vitest run src/availability` — expect PASS (slots 18, dayContext 9). Then `cd functions && npx tsc --noEmit -p .` and `cd functions && npm run lint` — no errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/availability/slots.ts functions/src/availability/slots.test.ts functions/src/availability/dayContext.ts functions/src/availability/dayContext.test.ts
git commit -m "feat(availability): Europe/Rome slot engine and provider-day context"
```

---

### Task 2: `getProviderSlots` callable

**Files:**
- Create: `functions/src/availability/validate.ts` (slots request only; Task 4 extends it)
- Create: `functions/src/availability/dayReads.ts`
- Create: `functions/src/availability/callables.ts` (`getProviderSlots` only; Task 4 adds the other)
- Create: `functions/src/availability/index.ts`
- Modify: `functions/src/index.ts` (one export line)
- Test: `functions/src/availability/validate.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/availability/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateSlotsRequest } from "./validate";

describe("validateSlotsRequest", () => {
  it("accepts ids and a date", () => {
    expect(validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" }))
      .toEqual({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" });
  });

  it("rejects path-like ids and bad dates", () => {
    expect(() => validateSlotsRequest({ instructorId: "a/b", serviceId: "s1", date: "2026-09-21" }))
      .toThrow(/instructorId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "", date: "2026-09-21" }))
      .toThrow(/serviceId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "21/09/2026" }))
      .toThrow(/date/);
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/availability/validate.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** — `functions/src/availability/validate.ts`:

```ts
import { HttpsError } from "firebase-functions/v2/https";
import { isDateKey } from "./slots";

type Obj = Record<string, unknown>;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function asObject(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${what} must be an object`);
  return v as Obj;
}

function docId(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "" || v.includes("/")) bad(`${what} must be a document id`);
  return v;
}

/** getProviderSlots input. */
export function validateSlotsRequest(data: unknown): { instructorId: string; serviceId: string; date: string } {
  const d = asObject(data, "payload");
  const instructorId = docId(d.instructorId, "instructorId");
  const serviceId = docId(d.serviceId, "serviceId");
  if (!isDateKey(d.date)) bad("date must be YYYY-MM-DD");
  return { instructorId, serviceId, date: d.date };
}
```

- [ ] **Step 4: Run** `cd functions && npx vitest run src/availability/validate.test.ts` — expect PASS (2 tests).

- [ ] **Step 5: The provider-day reads** — `functions/src/availability/dayReads.ts`:

```ts
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { romeDayBounds } from "./slots";
import type { DayDocs } from "./dayContext";

/**
 * Server-only lock for one provider-day. createBooking reads and writes it inside its
 * transaction, so two requests for the same provider and day run one after the other and
 * the second one sees the first one's booking.
 */
export function bookingDayRef(db: Firestore, instructorId: string, date: string): DocumentReference {
  return db.collection("instructors").doc(instructorId).collection("bookingDays").doc(date);
}

/**
 * The documents one provider-day needs: the instructor (weekly hours, booking rules), that
 * date's override and the bookings that start that day (every status — dayContextFrom keeps
 * the active ones, so no status index is needed). Pass `tx` to read inside a transaction;
 * that also reads the provider-day lock.
 */
export async function readDayDocs(
  db: Firestore,
  instructorId: string,
  date: string,
  tx?: Transaction,
): Promise<DayDocs> {
  const instructorRef = db.collection("instructors").doc(instructorId);
  const overrideRef = instructorRef.collection("availability").doc(date);
  const { start, end } = romeDayBounds(date);
  // orderBy desc matches the existing (instructorId ASC, scheduledAt DESC) composite index.
  const bookingsQuery = db.collection("bookings")
    .where("instructorId", "==", instructorId)
    .where("scheduledAt", ">=", Timestamp.fromDate(start))
    .where("scheduledAt", "<", Timestamp.fromDate(end))
    .orderBy("scheduledAt", "desc");

  const [instructor, override, bookings] = tx ?
    await Promise.all([
      tx.get(instructorRef),
      tx.get(overrideRef),
      tx.get(bookingsQuery),
      tx.get(bookingDayRef(db, instructorId, date)),
    ]) :
    await Promise.all([instructorRef.get(), overrideRef.get(), bookingsQuery.get()]);

  return {
    instructor: instructor.data(),
    override: override.data(),
    bookings: bookings.docs.map((d) => d.data()),
  };
}
```

- [ ] **Step 6: The callable** — `functions/src/availability/callables.ts`:

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { dayContextFrom } from "./dayContext";
import { readDayDocs } from "./dayReads";
import { freeSlots, romeInstant } from "./slots";
import { validateSlotsRequest } from "./validate";

const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Signed-in users: the free start times for one provider, service and date.
 *
 * Runs server-side because it has to see the provider's other bookings, which clients may
 * not read. Each slot carries its instant so the client can book it without doing
 * Europe/Rome arithmetic in the browser.
 */
export const getProviderSlots = onCall({ region }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { instructorId, serviceId, date } = validateSlotsRequest(req.data);

  const db = getFirestore();
  const serviceSnap = await db.collection("instructors").doc(instructorId)
    .collection("services").doc(serviceId).get();
  const service = serviceSnap.data();
  if (!service || service.isActive === false) throw new HttpsError("not-found", "service_not_found");

  const docs = await readDayDocs(db, instructorId, date);
  if (!docs.instructor) throw new HttpsError("not-found", "instructor_not_found");

  const slots = freeSlots({
    ...dayContextFrom(docs),
    durationMinutes: Number(service.durationMinutes),
    date,
    now: new Date(),
  });
  return { slots: slots.map((time) => ({ time, startsAt: romeInstant(date, time).toISOString() })) };
});
```

`functions/src/availability/index.ts`:

```ts
export * from "./callables";
```

In `functions/src/index.ts`, directly after `export * from "./providers/backfillSelfRegisteredProviders";` add:

```ts
export * from "./availability";
```

- [ ] **Step 7: Verify** — `cd functions && npx vitest run src/availability` (expect 29 passing), `cd functions && npx tsc --noEmit -p .`, `cd functions && npm run lint`, `cd functions && npm run build` — all clean.

- [ ] **Step 8: Commit**

```bash
git add functions/src/availability/validate.ts functions/src/availability/validate.test.ts functions/src/availability/dayReads.ts functions/src/availability/callables.ts functions/src/availability/index.ts functions/src/index.ts
git commit -m "feat(availability): getProviderSlots callable — free starts for a provider, service and day"
```

---

### Task 3: Booking picker shows only the server's slots

**Files:**
- Create: `src/lib/availability/dates.ts`, `src/lib/firebase/availability.ts` (slots only; Task 5 extends it)
- Modify: `src/types/booking.ts` (`TimeSlot`), `src/lib/firebookings.ts` (`getProviderAvailability`, drop `generateDefaultTimeSlots`), `src/stores/bookingStore.ts` (`fetchAvailability`)
- Modify: `src/components/booking/AvailabilityPicker.tsx`, `src/app/book/BookingClient.tsx`, `src/app/(main)/bookings/[id]/reschedule/BookingRescheduleClient.tsx`, `src/app/(main)/booking/confirm/page.tsx`
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`
- Test: `src/lib/availability/dates.test.ts`, `src/lib/firebookings.test.ts`, `src/stores/bookingStore.availability.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/availability/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDaysToKey, localDateKey, romeDateKey } from './dates';

describe('availability date keys', () => {
  it('names the Italian calendar day of an instant', () => {
    expect(romeDateKey(new Date('2026-09-20T22:30:00Z'))).toBe('2026-09-21'); // 00:30 in Rome
    expect(romeDateKey(new Date('2026-09-21T21:59:00Z'))).toBe('2026-09-21'); // 23:59 in Rome
  });

  it('names the day a local-midnight picker cell stands for', () => {
    expect(localDateKey(new Date(2026, 8, 21))).toBe('2026-09-21');
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across month and year ends', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-09-19', 365)).toBe('2027-09-19');
  });
});
```

In `src/lib/firebookings.test.ts`, replace

```ts
import { getDocs } from 'firebase/firestore';
import { searchProviders } from './firebookings';
```

with

```ts
vi.mock('./firebase/availability', () => ({ fetchProviderSlots: vi.fn() }));

import { getDocs } from 'firebase/firestore';
import { fetchProviderSlots } from './firebase/availability';
import { getProviderAvailability, searchProviders } from './firebookings';
```

and append:

```ts
describe('getProviderAvailability', () => {
  it('asks the server for the picker day and returns only offered, bookable slots', async () => {
    vi.mocked(fetchProviderSlots).mockResolvedValueOnce([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z' },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z' },
    ]);
    // A picker cell is local midnight; the key must be that calendar day, not its UTC date.
    const slots = await getProviderAvailability('p1', 's1', new Date(2026, 8, 21));

    expect(fetchProviderSlots).toHaveBeenCalledWith({ instructorId: 'p1', serviceId: 's1', date: '2026-09-21' });
    expect(slots).toEqual([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z', isAvailable: true, isBooked: false },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z', isAvailable: true, isBooked: false },
    ]);
  });
});
```

`src/stores/bookingStore.availability.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebookings', () => ({
  searchProviders: vi.fn(),
  getProviderAvailability: vi.fn(),
  createBooking: vi.fn(),
  getUserBookings: vi.fn(),
  getBooking: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  applyPromoCode: vi.fn(),
}));

import { getProviderAvailability } from '@/lib/firebookings';
import { useBookingStore } from './bookingStore';

const slot = (time: string) => ({ time, startsAt: `2026-09-21T${time}:00+02:00`, isAvailable: true, isBooked: false });
const DAY = new Date(2026, 8, 21);

beforeEach(() => {
  vi.clearAllMocks();
  useBookingStore.setState({ availability: [], selectedTime: null, availabilityError: null });
});

describe('bookingStore.fetchAvailability', () => {
  it('asks for the selected service and stores the offered slots', async () => {
    vi.mocked(getProviderAvailability).mockResolvedValue([slot('09:00'), slot('10:00')]);
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);

    expect(getProviderAvailability).toHaveBeenCalledWith('p1', 's1', DAY);
    expect(useBookingStore.getState().availability.map((s) => s.time)).toEqual(['09:00', '10:00']);
  });

  it('forgets a chosen time that is no longer offered', async () => {
    useBookingStore.setState({ selectedTime: '09:00' });
    vi.mocked(getProviderAvailability).mockResolvedValue([slot('10:00')]);
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().selectedTime).toBeNull();
  });

  it('ignores an answer that arrives after a newer request', async () => {
    let releaseFirst: (v: ReturnType<typeof slot>[]) => void = () => {};
    vi.mocked(getProviderAvailability)
      .mockImplementationOnce(() => new Promise((r) => { releaseFirst = r; }))
      .mockResolvedValueOnce([slot('15:00')]);

    const first = useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    await useBookingStore.getState().fetchAvailability('p1', 's1', new Date(2026, 8, 22));
    releaseFirst([slot('09:00')]);
    await first;

    expect(useBookingStore.getState().availability.map((s) => s.time)).toEqual(['15:00']);
  });

  it('says "sign in" rather than "no times" to a signed-out visitor', async () => {
    vi.mocked(getProviderAvailability).mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/unauthenticated' }));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('signin');

    vi.mocked(getProviderAvailability).mockRejectedValue(new Error('offline'));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('failed');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/availability/dates.test.ts src/lib/firebookings.test.ts src/stores/bookingStore.availability.test.ts` — expect FAIL (missing modules / wrong signature).

- [ ] **Step 3: Date keys** — `src/lib/availability/dates.ts`:

```ts
/**
 * Calendar-date keys ("YYYY-MM-DD") without a timezone library. The server does the real
 * Europe/Rome arithmetic (functions/src/availability/slots.ts); the client only needs to name
 * days.
 */

const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date it is in Italy at `instant` — "today" for a provider, wherever the device is. */
export function romeDateKey(instant: Date): string {
  return ROME_DAY.format(instant);
}

/**
 * The calendar day a date picker cell stands for. Picker cells are local midnights, so this
 * reads the local fields — `toISOString()` would turn Italian midnight into the day before.
 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Callable wrapper** — `src/lib/firebase/availability.ts`:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export interface ProviderSlot {
  time: string; // "HH:mm", Europe/Rome
  startsAt: string; // ISO instant — what createBooking's scheduledAt must be
}

export async function fetchProviderSlots(input: {
  instructorId: string;
  serviceId: string;
  date: string;
}): Promise<ProviderSlot[]> {
  const fn = httpsCallable<typeof input, { slots: ProviderSlot[] }>(functions, 'getProviderSlots');
  return (await fn(input)).data.slots;
}
```

- [ ] **Step 5: `TimeSlot` carries the instant** — in `src/types/booking.ts` replace

```ts
export interface TimeSlot {
  time: string;
  isAvailable: boolean;
  isBooked: boolean;
}
```

with

```ts
export interface TimeSlot {
  time: string;
  isAvailable: boolean;
  isBooked: boolean;
  /** The slot's instant (ISO), from getProviderSlots. createBooking's scheduledAt is this. */
  startsAt?: string;
}
```

- [ ] **Step 6: `firebookings.ts`** — add after the `from './firebase/functions';` import block:

```ts
import { fetchProviderSlots } from './firebase/availability';
import { localDateKey } from './availability/dates';
```

delete the line `const AVAILABILITY_COLLECTION = 'availability';`, and replace everything from `// Get provider availability for a specific date` down to (not including) the `/**\n * Create a booking.` comment — i.e. the old `getProviderAvailability` and `generateDefaultTimeSlots` — with:

```ts
/**
 * The times a client can book with `providerId` for `serviceId` on the picker day `date`.
 *
 * Asks the getProviderSlots callable, which applies the provider's weekly hours, date
 * exceptions, notice, buffer and daily cap against their real bookings. It replaced a read of
 * per-date docs that nothing wrote, so every provider looked free 09:00–18:30 every day.
 */
export async function getProviderAvailability(
  providerId: string,
  serviceId: string,
  date: Date
): Promise<TimeSlot[]> {
  const slots = await fetchProviderSlots({
    instructorId: providerId,
    serviceId,
    date: localDateKey(date),
  });
  return slots.map((s) => ({ time: s.time, startsAt: s.startsAt, isAvailable: true, isBooked: false }));
}

```

- [ ] **Step 7: `bookingStore.ts`**
  - In `BookingState`, after `isLoadingAvailability: boolean;` add:

```ts
  /** Why `availability` is empty when it is not simply a full day. */
  availabilityError: 'signin' | 'failed' | null;
```

  - Change the action type to `fetchAvailability: (providerId: string, serviceId: string, date: Date) => Promise<void>;`
  - In the initial state, after `isLoadingAvailability: false,` add `availabilityError: null,`.
  - In `selectProvider` and `selectService`, after `availability: [],` add `availabilityError: null,`.
  - Directly above `export const useBookingStore = create<BookingState>((set, get) => ({` add `let latestAvailabilityRequest = 0;` and a blank line.
  - Replace the `fetchAvailability` implementation with:

```ts
  fetchAvailability: async (providerId: string, serviceId: string, date: Date) => {
    // Tapping through dates quickly must not let a slow, older answer overwrite a newer one.
    const request = ++latestAvailabilityRequest;
    set({ isLoadingAvailability: true, availabilityError: null });
    try {
      const slots = await getProviderAvailability(providerId, serviceId, date);
      if (request !== latestAvailabilityRequest) return;
      // A chosen time that is no longer offered (just taken, say) is no longer chosen.
      const { selectedTime } = get();
      const stillOffered = !selectedTime || slots.some((s) => s.time === selectedTime);
      set({
        availability: slots,
        isLoadingAvailability: false,
        ...(stillOffered ? {} : { selectedTime: null }),
      });
    } catch (error) {
      if (request !== latestAvailabilityRequest) return;
      const code = (error as { code?: string } | null)?.code;
      set({
        availability: [],
        isLoadingAvailability: false,
        availabilityError: code === 'functions/unauthenticated' ? 'signin' : 'failed',
      });
    }
  },
```

- [ ] **Step 8: Run** `npx vitest run src/lib/availability/dates.test.ts src/lib/firebookings.test.ts src/stores/bookingStore.availability.test.ts` — expect PASS (3 + 2 + 4).

- [ ] **Step 9: i18n** — insert after `'booking.availability.tryAnotherDate'` in each file:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `booking.availability.signInToSee` | `Accedi per vedere gli orari disponibili.` | `Sign in to see available times.` | `Inicia sesión para ver los horarios disponibles.` | `Connectez-vous pour voir les créneaux disponibles.` | `Melde dich an, um verfügbare Zeiten zu sehen.` |
| `booking.availability.signIn` | `Accedi` | `Sign in` | `Iniciar sesión` | `Se connecter` | `Anmelden` |
| `booking.availability.loadError` | `Impossibile caricare gli orari. Riprova.` | `Could not load times. Please try again.` | `No se pudieron cargar los horarios. Inténtalo de nuevo.` | `Impossible de charger les créneaux. Veuillez réessayer.` | `Zeiten konnten nicht geladen werden. Bitte versuche es erneut.` |

- [ ] **Step 10: Picker notice** — in `src/components/booking/AvailabilityPicker.tsx`:
  - Props: after `className?: string;` add

```ts
  /** Shown instead of the time slots, e.g. "sign in to see times" or a load failure. */
  slotsNotice?: React.ReactNode;
```

  - Destructuring: after `className,` add `slotsNotice,`.
  - Replace `{isLoading ? (` (the one opening the spinner under the time-slots header) with:

```tsx
          {slotsNotice ? (
            <div className="py-8 text-center text-text-secondary">{slotsNotice}</div>
          ) : isLoading ? (
```

- [ ] **Step 11: `BookingClient.tsx`**
  - Imports: after `import { useSearchParams, useRouter } from 'next/navigation';` add `import Link from 'next/link';`; after `import { useBookingStore } from '@/stores/bookingStore';` add `import { useAuthStore } from '@/stores/authStore';`.
  - In the `useBookingStore()` destructuring add `availabilityError,` after `isLoadingAvailability,`, and below the destructuring add:

```tsx
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const authReady = useAuthStore((s) => s.isInitialized);
```

  - Replace the effect commented `// Fetch availability when date changes` with:

```tsx
  // Slots depend on the service (its duration) as well as the date, and only signed-in users
  // may ask for them.
  useEffect(() => {
    if (provider && selectedService && selectedDate && firebaseUser) {
      fetchAvailability(provider.id, selectedService.id, selectedDate);
    }
  }, [provider, selectedService, selectedDate, firebaseUser, fetchAvailability]);

  const slotsNotice = (authReady && !firebaseUser) || availabilityError === 'signin' ? (
    <>
      <p>{t('booking.availability.signInToSee')}</p>
      <Link
        href="/auth/login"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--section-primary)] px-5 font-semibold text-white"
      >
        {t('booking.availability.signIn')}
      </Link>
    </>
  ) : availabilityError === 'failed' ? (
    <p>{t('booking.availability.loadError')}</p>
  ) : null;
```

  - On the `<AvailabilityPicker …>` add `slotsNotice={slotsNotice}` after `isLoading={isLoadingAvailability}`.

- [ ] **Step 12: Reschedule compiles against the new signature** — in `BookingRescheduleClient.tsx` replace

```tsx
  useEffect(() => {
    if (!isReschedulable || !booking.providerId || !selectedDate) return;
    void fetchAvailability(booking.providerId, selectedDate);
  }, [booking.providerId, fetchAvailability, isReschedulable, selectedDate]);
```

with

```tsx
  useEffect(() => {
    if (!isReschedulable || !booking.providerId || !booking.serviceId || !selectedDate) return;
    void fetchAvailability(booking.providerId, booking.serviceId, selectedDate);
  }, [booking.providerId, booking.serviceId, fetchAvailability, isReschedulable, selectedDate]);
```

(Nothing else changes in the reschedule flow — see Open questions.)

- [ ] **Step 13: Confirm page books the slot's instant** — in `src/app/(main)/booking/confirm/page.tsx` add `availability,` after `selectedTime,` in the `useBookingStore()` destructuring, and in `handleCreateBooking` replace

```tsx
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);
```

with

```tsx
      // The slot's own instant: its time is Italian time, whatever the device's zone is.
      const startsAt = availability.find((s) => s.time === selectedTime)?.startsAt;
      const scheduledAt = startsAt ? new Date(startsAt) : new Date(selectedDate);
      if (!startsAt) {
        const [hours, minutes] = selectedTime.split(':').map(Number);
        scheduledAt.setHours(hours, minutes, 0, 0);
      }
```

- [ ] **Step 14: Verify** — `npx vitest run src/lib/availability src/lib/firebookings.test.ts src/stores/bookingStore.availability.test.ts src/i18n` (PASS), `npx tsc --noEmit -p .`, `npx eslint src/lib/availability src/lib/firebase/availability.ts src/lib/firebookings.ts src/stores/bookingStore.ts src/components/booking src/app/book "src/app/(main)/bookings/[id]/reschedule" "src/app/(main)/booking/confirm"` — clean.

- [ ] **Step 15: Commit**

```bash
git add src/lib/availability/dates.ts src/lib/availability/dates.test.ts src/lib/firebase/availability.ts src/types/booking.ts src/lib/firebookings.ts src/lib/firebookings.test.ts src/stores/bookingStore.ts src/stores/bookingStore.availability.test.ts src/components/booking/AvailabilityPicker.tsx src/app/book/BookingClient.tsx "src/app/(main)/bookings/[id]/reschedule/BookingRescheduleClient.tsx" "src/app/(main)/booking/confirm/page.tsx" src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(booking): time picker offers only the provider's real free slots"
```

---

### Task 4: `updateMyAvailability` callable

**Files:**
- Modify (replace whole file): `functions/src/availability/validate.ts`, `functions/src/availability/callables.ts`
- Test (replace whole file): `functions/src/availability/validate.test.ts`

- [ ] **Step 1: Write the failing tests** — replace `functions/src/availability/validate.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  canManageOwnAvailability,
  validateAvailabilityUpdate,
  validateSlotsRequest,
  MAX_OVERRIDE_WRITES,
} from "./validate";

const RULES = { bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 };
const mon = (startTime: string, endTime: string) => ({ dayOfWeek: 1, startTime, endTime, isAvailable: true });

function payload(overrides: Record<string, unknown> = {}) {
  return { schedule: [mon("09:00", "12:00")], bookingRules: RULES, overrides: { upsert: [], delete: [] }, ...overrides };
}

describe("validateAvailabilityUpdate", () => {
  it("accepts a well-formed update and normalizes it", () => {
    const out = validateAvailabilityUpdate(payload({
      schedule: [mon("09:00", "12:00"), mon("14:00", "18:00"), { dayOfWeek: 6, startTime: "10:00", endTime: "12:00" }],
      overrides: {
        upsert: [{ date: "2026-12-24", isAvailable: false, windows: [], reason: "  Vigilia  " }],
        delete: ["2026-11-01"],
      },
    }));
    expect(out.schedule).toHaveLength(3);
    expect(out.schedule[2]).toEqual({ dayOfWeek: 6, startTime: "10:00", endTime: "12:00", isAvailable: true });
    expect(out.bookingRules).toEqual(RULES);
    expect(out.upserts).toEqual([{ date: "2026-12-24", isAvailable: false, windows: [], reason: "Vigilia" }]);
    expect(out.deletes).toEqual(["2026-11-01"]);
  });

  it("accepts an empty schedule — the provider is then simply not bookable", () => {
    expect(validateAvailabilityUpdate(payload({ schedule: [] })).schedule).toEqual([]);
  });

  it("rejects malformed times and a start that is not before the end", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("9:00", "12:00")] }))).toThrow(/HH:mm/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("12:00", "12:00")] }))).toThrow(/before end/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("24:00", "25:00")] }))).toThrow(/HH:mm/);
  });

  it("rejects overlapping windows on one day but allows touching ones", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), mon("11:00", "13:00")] })))
      .toThrow(/overlap/);
    expect(validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), mon("12:00", "13:00")] }))
      .schedule).toHaveLength(2);
  });

  it("does not hold a switched-off day's windows against the others", () => {
    const off = { ...mon("10:00", "11:00"), isAvailable: false };
    expect(validateAvailabilityUpdate(payload({ schedule: [mon("09:00", "12:00"), off] })).schedule[1].isAvailable)
      .toBe(false);
  });

  it("rejects a dayOfWeek outside 0–6", () => {
    expect(() => validateAvailabilityUpdate(payload({ schedule: [{ ...mon("09:00", "10:00"), dayOfWeek: 7 }] })))
      .toThrow(/dayOfWeek/);
  });

  it("rejects booking rules out of range", () => {
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, maxBookingsPerDay: 0 } })))
      .toThrow(/maxBookingsPerDay/);
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, bufferMinutes: 7.5 } })))
      .toThrow(/bufferMinutes/);
    expect(() => validateAvailabilityUpdate(payload({ bookingRules: { ...RULES, minAdvanceNoticeHours: 500 } })))
      .toThrow(/minAdvanceNoticeHours/);
  });

  it("rejects bad override dates, duplicates and a date both kept and deleted", () => {
    const day = (date: string) => ({ date, isAvailable: false, windows: [] });
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [day("2026-02-30")], delete: [] } })))
      .toThrow(/YYYY-MM-DD/);
    expect(() => validateAvailabilityUpdate(payload({
      overrides: { upsert: [day("2026-12-24"), day("2026-12-24")], delete: [] },
    }))).toThrow(/twice/);
    expect(() => validateAvailabilityUpdate(payload({
      overrides: { upsert: [day("2026-12-24")], delete: ["2026-12-24"] },
    }))).toThrow(/both/);
  });

  it("validates custom-hours windows and drops windows from a closed day", () => {
    const custom = { date: "2026-12-24", isAvailable: true, windows: [{ start: "10:00", end: "09:00" }] };
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [custom], delete: [] } })))
      .toThrow(/before end/);
    const closed = { date: "2026-12-24", isAvailable: false, windows: [{ start: "10:00", end: "11:00" }] };
    expect(validateAvailabilityUpdate(payload({ overrides: { upsert: [closed], delete: [] } })).upserts[0].windows)
      .toEqual([]);
  });

  it(`caps a save at ${MAX_OVERRIDE_WRITES} date exceptions`, () => {
    const deletes = Array.from({ length: MAX_OVERRIDE_WRITES + 1 }, (_, i) =>
      new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
    expect(() => validateAvailabilityUpdate(payload({ overrides: { upsert: [], delete: deletes } })))
      .toThrow(/at most/);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateAvailabilityUpdate(null)).toThrow(/payload/);
    expect(() => validateAvailabilityUpdate(payload({ schedule: "mon 9-5" }))).toThrow(/schedule/);
  });
});

describe("validateSlotsRequest", () => {
  it("accepts ids and a date", () => {
    expect(validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" }))
      .toEqual({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" });
  });

  it("rejects path-like ids and bad dates", () => {
    expect(() => validateSlotsRequest({ instructorId: "a/b", serviceId: "s1", date: "2026-09-21" }))
      .toThrow(/instructorId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "", date: "2026-09-21" }))
      .toThrow(/serviceId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "21/09/2026" }))
      .toThrow(/date/);
  });
});

describe("canManageOwnAvailability", () => {
  it("lets verified and pending providers and staff in", () => {
    expect(canManageOwnAvailability({ providerStatus: "verified" })).toBe(true);
    expect(canManageOwnAvailability({ providerStatus: "pending", role: "customer" })).toBe(true);
    expect(canManageOwnAvailability({ role: "admin" })).toBe(true);
    expect(canManageOwnAvailability({ role: "superadmin" })).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canManageOwnAvailability(undefined)).toBe(false);
    expect(canManageOwnAvailability({ role: "customer" })).toBe(false);
    expect(canManageOwnAvailability({ role: "provider", providerStatus: "rejected" })).toBe(false);
    expect(canManageOwnAvailability({ providerStatus: "verified", isDeleted: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/availability/validate.test.ts` — expect FAIL (`validateAvailabilityUpdate`, `canManageOwnAvailability`, `MAX_OVERRIDE_WRITES` not exported).

- [ ] **Step 3: Implement** — replace `functions/src/availability/validate.ts` with:

```ts
import { HttpsError } from "firebase-functions/v2/https";
import {
  isDateKey,
  isTimeKey,
  toMinutes,
  type BookingRules,
  type DateOverride,
  type TimeWindow,
  type WeeklyWindow,
} from "./slots";

export const MAX_WINDOWS_PER_DAY = 10;
/** One batch: the instructor doc plus every override write must stay under Firestore's 500. */
export const MAX_OVERRIDE_WRITES = 400;
const MAX_REASON = 200;

export interface OverrideUpsert extends DateOverride {
  date: string;
}

export interface AvailabilityUpdate {
  schedule: WeeklyWindow[];
  bookingRules: BookingRules;
  upserts: OverrideUpsert[];
  deletes: string[];
}

type Obj = Record<string, unknown>;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function asObject(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${what} must be an object`);
  return v as Obj;
}

function intIn(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    bad(`${what} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function timeWindow(v: unknown, what: string): TimeWindow {
  const w = asObject(v, what);
  if (!isTimeKey(w.start) || !isTimeKey(w.end)) bad(`${what}: times must be HH:mm`);
  if (toMinutes(w.start) >= toMinutes(w.end)) bad(`${what}: start must be before end`);
  return { start: w.start, end: w.end };
}

function assertNoOverlap(windows: TimeWindow[], what: string): void {
  const sorted = [...windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) bad(`${what}: windows overlap`);
  }
}

function validateSchedule(v: unknown): WeeklyWindow[] {
  if (!Array.isArray(v)) bad("schedule must be an array");
  const schedule = v.map((raw, i): WeeklyWindow => {
    const e = asObject(raw, `schedule[${i}]`);
    const dayOfWeek = intIn(e.dayOfWeek, 0, 6, `schedule[${i}].dayOfWeek`);
    const w = timeWindow({ start: e.startTime, end: e.endTime }, `schedule[${i}]`);
    if (e.isAvailable !== undefined && typeof e.isAvailable !== "boolean") {
      bad(`schedule[${i}].isAvailable must be a boolean`);
    }
    return { dayOfWeek, startTime: w.start, endTime: w.end, isAvailable: e.isAvailable !== false };
  });
  for (let day = 0; day <= 6; day++) {
    const open = schedule
      .filter((s) => s.dayOfWeek === day && s.isAvailable)
      .map((s) => ({ start: s.startTime, end: s.endTime }));
    if (open.length > MAX_WINDOWS_PER_DAY) bad(`day ${day}: at most ${MAX_WINDOWS_PER_DAY} windows`);
    assertNoOverlap(open, `day ${day}`);
  }
  return schedule;
}

function validateRules(v: unknown): BookingRules {
  const r = asObject(v, "bookingRules");
  return {
    bufferMinutes: intIn(r.bufferMinutes, 0, 120, "bookingRules.bufferMinutes"),
    minAdvanceNoticeHours: intIn(r.minAdvanceNoticeHours, 0, 168, "bookingRules.minAdvanceNoticeHours"),
    maxBookingsPerDay: intIn(r.maxBookingsPerDay, 1, 50, "bookingRules.maxBookingsPerDay"),
  };
}

function validateUpsert(v: unknown, i: number): OverrideUpsert {
  const what = `overrides.upsert[${i}]`;
  const o = asObject(v, what);
  if (!isDateKey(o.date)) bad(`${what}.date must be YYYY-MM-DD`);
  if (typeof o.isAvailable !== "boolean") bad(`${what}.isAvailable must be a boolean`);
  const rawWindows = o.windows ?? [];
  if (!Array.isArray(rawWindows) || rawWindows.length > MAX_WINDOWS_PER_DAY) {
    bad(`${what}.windows must be an array of at most ${MAX_WINDOWS_PER_DAY}`);
  }
  const windows = o.isAvailable ? rawWindows.map((w, j) => timeWindow(w, `${what}.windows[${j}]`)) : [];
  assertNoOverlap(windows, what);
  const out: OverrideUpsert = { date: o.date, isAvailable: o.isAvailable, windows };
  if (o.reason !== undefined && o.reason !== null) {
    if (typeof o.reason !== "string") bad(`${what}.reason must be a string`);
    const reason = o.reason.trim().slice(0, MAX_REASON);
    if (reason) out.reason = reason;
  }
  return out;
}

/** Everything updateMyAvailability writes, checked once, before any write. */
export function validateAvailabilityUpdate(data: unknown): AvailabilityUpdate {
  const d = asObject(data, "payload");
  const schedule = validateSchedule(d.schedule);
  const bookingRules = validateRules(d.bookingRules);

  const overrides = asObject(d.overrides ?? { upsert: [], delete: [] }, "overrides");
  const rawUpserts = overrides.upsert ?? [];
  const rawDeletes = overrides.delete ?? [];
  if (!Array.isArray(rawUpserts) || !Array.isArray(rawDeletes)) {
    bad("overrides.upsert and overrides.delete must be arrays");
  }
  if (rawUpserts.length + rawDeletes.length > MAX_OVERRIDE_WRITES) {
    bad(`at most ${MAX_OVERRIDE_WRITES} date exceptions per save`);
  }
  const upserts = rawUpserts.map(validateUpsert);
  const deletes = rawDeletes.map((date, i) => {
    if (!isDateKey(date)) bad(`overrides.delete[${i}] must be YYYY-MM-DD`);
    return date;
  });

  const upsertDates = new Set(upserts.map((u) => u.date));
  if (upsertDates.size !== upserts.length) bad("a date appears twice in overrides.upsert");
  if (deletes.some((date) => upsertDates.has(date))) bad("a date is both upserted and deleted");

  return { schedule, bookingRules, upserts, deletes: [...new Set(deletes)] };
}

function docId(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "" || v.includes("/")) bad(`${what} must be a document id`);
  return v;
}

/** getProviderSlots input. */
export function validateSlotsRequest(data: unknown): { instructorId: string; serviceId: string; date: string } {
  const d = asObject(data, "payload");
  const instructorId = docId(d.instructorId, "instructorId");
  const serviceId = docId(d.serviceId, "serviceId");
  if (!isDateKey(d.date)) bad("date must be YYYY-MM-DD");
  return { instructorId, serviceId, date: d.date };
}

/** Same gate as the /provider area: an approved or pending provider, or staff. */
export function canManageOwnAvailability(user: Record<string, unknown> | undefined): boolean {
  if (!user || user.isDeleted === true) return false;
  return user.providerStatus === "verified" ||
    user.providerStatus === "pending" ||
    user.role === "admin" ||
    user.role === "superadmin";
}
```

- [ ] **Step 4: Run** `cd functions && npx vitest run src/availability/validate.test.ts` — expect PASS (15 tests).

- [ ] **Step 5: The callable** — replace `functions/src/availability/callables.ts` with:

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { dayContextFrom } from "./dayContext";
import { readDayDocs } from "./dayReads";
import { freeSlots, romeInstant } from "./slots";
import { canManageOwnAvailability, validateAvailabilityUpdate, validateSlotsRequest } from "./validate";

const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Signed-in users: the free start times for one provider, service and date.
 *
 * Runs server-side because it has to see the provider's other bookings, which clients may
 * not read. Each slot carries its instant so the client can book it without doing
 * Europe/Rome arithmetic in the browser.
 */
export const getProviderSlots = onCall({ region }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { instructorId, serviceId, date } = validateSlotsRequest(req.data);

  const db = getFirestore();
  const serviceSnap = await db.collection("instructors").doc(instructorId)
    .collection("services").doc(serviceId).get();
  const service = serviceSnap.data();
  if (!service || service.isActive === false) throw new HttpsError("not-found", "service_not_found");

  const docs = await readDayDocs(db, instructorId, date);
  if (!docs.instructor) throw new HttpsError("not-found", "instructor_not_found");

  const slots = freeSlots({
    ...dayContextFrom(docs),
    durationMinutes: Number(service.durationMinutes),
    date,
    now: new Date(),
  });
  return { slots: slots.map((time) => ({ time, startsAt: romeInstant(date, time).toISOString() })) };
});

/**
 * The provider saves their own weekly hours, booking rules and date exceptions.
 *
 * A callable, not a client write: the owner rule on instructors/{uid} compares a `uid` field
 * that older provider documents lack, and this validates the whole schedule once, here.
 */
export const updateMyAvailability = onCall({ region }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");

  const db = getFirestore();
  const instructorRef = db.collection("instructors").doc(uid);
  const [userSnap, instructorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    instructorRef.get(),
  ]);
  if (!canManageOwnAvailability(userSnap.data())) {
    throw new HttpsError("permission-denied", "Providers only");
  }
  // Never create a bare catalogue entry: a provider without a profile has nothing to book.
  if (!instructorSnap.exists) throw new HttpsError("failed-precondition", "no_instructor_profile");

  const update = validateAvailabilityUpdate(req.data);

  const batch = db.batch();
  batch.update(instructorRef, {
    availabilitySchedule: update.schedule,
    bookingRules: update.bookingRules,
    // backfillAvailability leaves a provider alone once this is set.
    availabilityUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const { date, ...override } of update.upserts) {
    batch.set(instructorRef.collection("availability").doc(date), {
      ...override,
      date,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (const date of update.deletes) {
    batch.delete(instructorRef.collection("availability").doc(date));
  }
  await batch.commit();

  return {
    windows: update.schedule.length,
    overridesWritten: update.upserts.length,
    overridesDeleted: update.deletes.length,
  };
});
```

- [ ] **Step 6: Verify** — `cd functions && npx vitest run src/availability` (42 passing), `cd functions && npx tsc --noEmit -p .`, `cd functions && npm run lint`, `cd functions && npm run build` — clean.

- [ ] **Step 7: Commit**

```bash
git add functions/src/availability/validate.ts functions/src/availability/validate.test.ts functions/src/availability/callables.ts
git commit -m "feat(availability): updateMyAvailability — validated save of hours, rules and date exceptions"
```

---

### Task 5: The availability page loads and saves real data

**Files:**
- Create: `src/lib/availability/adapter.ts`, `src/lib/availability/errors.ts`
- Modify (replace whole file): `src/lib/firebase/availability.ts`, `src/app/(main)/provider/availability/page.tsx`
- Modify: `src/stores/providerStore.ts`, `src/lib/firebase/provider.ts` (remove `updateAvailability`), `src/lib/firebase/index.ts` (drop its re-export), `src/components/provider/AvailabilityEditor.tsx`
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`
- Test: `src/lib/availability/adapter.test.ts`, `src/lib/availability/errors.test.ts`, `src/stores/providerStore.availability.test.ts`, `src/components/provider/AvailabilityEditor.test.tsx`

- [ ] **Step 1: Write the failing adapter and error tests**

`src/lib/availability/adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  hasBookableHours,
  overrideFromDoc,
  savedOverrides,
  scheduleFromDoc,
  toSettings,
  toUpdate,
  type OverrideDoc,
  type WeeklyWindow,
} from './adapter';

const mon = (startTime: string, endTime: string, isAvailable = true): WeeklyWindow =>
  ({ dayOfWeek: 1, startTime, endTime, isAvailable });
const RULES = { bufferMinutes: 0, minAdvanceNoticeHours: 2, maxBookingsPerDay: 5 };
const XMAS: OverrideDoc = { date: '2026-12-25', isAvailable: false, windows: [], reason: 'Natale' };

describe('toSettings (stored → editor)', () => {
  it('maps the flat array onto the weekday map, windows sorted, 0 = Sunday', () => {
    const { settings, isDraft } = toSettings({
      schedule: [mon('14:00', '18:00'), mon('09:00', '12:00'), { dayOfWeek: 0, startTime: '10:00', endTime: '12:00', isAvailable: true }],
      bookingRules: RULES,
      overrides: [],
    });
    expect(isDraft).toBe(false);
    expect(settings.weeklySchedule.monday).toEqual({
      isAvailable: true,
      slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    });
    expect(settings.weeklySchedule.sunday.isAvailable).toBe(true);
    expect(settings.weeklySchedule.tuesday).toEqual({ isAvailable: false, slots: [] });
    expect(settings).toMatchObject({ ...RULES, timezone: 'Europe/Rome' });
  });

  it('keeps a switched-off day off, with its windows', () => {
    const { settings } = toSettings({ schedule: [mon('09:00', '12:00', false)], bookingRules: null, overrides: [] });
    expect(settings.weeklySchedule.monday).toEqual({ isAvailable: false, slots: [{ start: '09:00', end: '12:00' }] });
  });

  it('opens a provider with no hours on the unsaved Mon–Fri 09–18 draft, default rules', () => {
    const { settings, isDraft } = toSettings({ schedule: null, bookingRules: null, overrides: [] });
    expect(isDraft).toBe(true);
    expect(settings.weeklySchedule.friday).toEqual({ isAvailable: true, slots: [{ start: '09:00', end: '18:00' }] });
    expect(settings.weeklySchedule.saturday).toEqual({ isAvailable: false, slots: [] });
    expect(settings).toMatchObject({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 });
  });

  it('lists date exceptions in date order with stable ids', () => {
    const custom: OverrideDoc = { date: '2026-12-24', isAvailable: true, windows: [{ start: '09:00', end: '12:00' }] };
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [XMAS, custom] });
    expect(settings.dateOverrides).toEqual([
      { id: 'override-2026-12-24', date: '2026-12-24', isAvailable: true, slots: [{ start: '09:00', end: '12:00' }], reason: '' },
      { id: 'override-2026-12-25', date: '2026-12-25', isAvailable: false, slots: [], reason: 'Natale' },
    ]);
  });
});

describe('toUpdate (editor → updateMyAvailability)', () => {
  it('round-trips a schedule', () => {
    const schedule = [mon('09:00', '12:00'), mon('14:00', '18:00'), { dayOfWeek: 6, startTime: '10:00', endTime: '12:00', isAvailable: false }];
    const { settings } = toSettings({ schedule, bookingRules: RULES, overrides: [XMAS] });
    const update = toUpdate(settings, [XMAS]);
    expect(update.schedule).toEqual(schedule);
    expect(update.bookingRules).toEqual(RULES);
  });

  it('sends only new or changed exceptions and deletes removed ones', () => {
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [XMAS] });
    settings.dateOverrides.push({ id: 'x', date: '2027-01-01', isAvailable: false, slots: [], reason: ' ' });
    expect(toUpdate(settings, [XMAS]).overrides).toEqual({
      upsert: [{ date: '2027-01-01', isAvailable: false, windows: [] }],
      delete: [],
    });

    settings.dateOverrides = settings.dateOverrides.filter((o) => o.date !== '2026-12-25');
    expect(toUpdate(settings, [XMAS]).overrides.delete).toEqual(['2026-12-25']);

    settings.dateOverrides[0] = { ...settings.dateOverrides[0], isAvailable: true, slots: [{ start: '10:00', end: '11:00' }] };
    expect(toUpdate(settings, [XMAS]).overrides.upsert).toEqual([
      { date: '2027-01-01', isAvailable: true, windows: [{ start: '10:00', end: '11:00' }] },
    ]);
  });

  it('drops the windows of a closed exception', () => {
    const { settings } = toSettings({ schedule: [], bookingRules: null, overrides: [] });
    settings.dateOverrides.push({ id: 'x', date: '2027-01-02', isAvailable: false, slots: [{ start: '09:00', end: '10:00' }] });
    expect(toUpdate(settings, []).overrides.upsert[0].windows).toEqual([]);
    expect(savedOverrides(settings)).toEqual([{ date: '2027-01-02', isAvailable: false, windows: [] }]);
  });
});

describe('doc readers', () => {
  it('tells "never saved" from "saved empty"', () => {
    expect(scheduleFromDoc({})).toBeNull();
    expect(scheduleFromDoc(undefined)).toBeNull();
    expect(scheduleFromDoc({ availabilitySchedule: [] })).toEqual([]);
    expect(scheduleFromDoc({ availabilitySchedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, { bad: 1 }] }))
      .toEqual([mon('09:00', '12:00')]);
  });

  it('reads an override doc and ignores foreign shapes', () => {
    expect(overrideFromDoc('2026-12-25', { isAvailable: false, windows: [], reason: 'Natale', updatedAt: 1 })).toEqual(XMAS);
    expect(overrideFromDoc('2026-12-25', { slots: [] })).toBeNull();
  });
});

describe('hasBookableHours', () => {
  it('needs at least one available window', () => {
    expect(hasBookableHours(null)).toBe(false);
    expect(hasBookableHours([])).toBe(false);
    expect(hasBookableHours([mon('09:00', '12:00', false)])).toBe(false);
    expect(hasBookableHours([mon('09:00', '12:00')])).toBe(true);
  });
});
```

`src/lib/availability/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { availabilitySaveErrorKey } from './errors';

const callableError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('availabilitySaveErrorKey', () => {
  it('explains a rejected schedule, a missing profile, and anything else', () => {
    expect(availabilitySaveErrorKey(callableError('functions/invalid-argument', 'day 1: windows overlap')))
      .toBe('provider.availability.error.invalid');
    expect(availabilitySaveErrorKey(callableError('functions/failed-precondition', 'no_instructor_profile')))
      .toBe('provider.availability.error.noProfile');
    expect(availabilitySaveErrorKey(new Error('offline'))).toBe('provider.availability.error.save');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/availability/adapter.test.ts src/lib/availability/errors.test.ts` — expect FAIL (modules not found).

- [ ] **Step 3: The adapter** — `src/lib/availability/adapter.ts`:

```ts
import type {
  AvailabilitySettings,
  DateOverride,
  DayOfWeek,
  TimeRange,
  WeeklySchedule,
} from '@/types/provider';

/**
 * Translates between what the server stores and what AvailabilityEditor edits.
 *
 * Stored (functions/src/availability): instructors/{uid}.availabilitySchedule — a flat array,
 * 0 = Sunday — plus bookingRules, plus one doc per date exception. Edited: the weekday map
 * and override list of AvailabilitySettings. Pure, so both directions are unit-tested.
 */

export interface WeeklyWindow {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isAvailable: boolean;
}

export interface BookingRules {
  bufferMinutes: number;
  minAdvanceNoticeHours: number;
  maxBookingsPerDay: number;
}

/** instructors/{uid}/availability/{date} */
export interface OverrideDoc {
  date: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  windows: TimeRange[];
  reason?: string;
}

export interface StoredAvailability {
  /** null when the provider never saved hours. */
  schedule: WeeklyWindow[] | null;
  bookingRules: Partial<BookingRules> | null;
  overrides: OverrideDoc[];
}

/** updateMyAvailability's input. */
export interface AvailabilityUpdate {
  schedule: WeeklyWindow[];
  bookingRules: BookingRules;
  overrides: { upsert: OverrideDoc[]; delete: string[] };
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  bufferMinutes: 15,
  minAdvanceNoticeHours: 24,
  maxBookingsPerDay: 8,
};

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const DAYS = Object.keys(DAY_INDEX) as DayOfWeek[];

type Raw = Record<string, unknown>;

/** instructors/{uid}.availabilitySchedule as stored; null when the provider never saved hours. */
export function scheduleFromDoc(data: Raw | undefined): WeeklyWindow[] | null {
  const raw = data?.availabilitySchedule;
  if (!Array.isArray(raw)) return null;
  return (raw as Raw[])
    .filter((w) => typeof w?.dayOfWeek === 'number' && typeof w.startTime === 'string' && typeof w.endTime === 'string')
    .map((w) => ({
      dayOfWeek: w.dayOfWeek as number,
      startTime: w.startTime as string,
      endTime: w.endTime as string,
      isAvailable: w.isAvailable !== false,
    }));
}

/** instructors/{uid}/availability/{date}; null for a doc that is not in the current shape. */
export function overrideFromDoc(date: string, data: Raw): OverrideDoc | null {
  if (typeof data.isAvailable !== 'boolean') return null;
  const windows = Array.isArray(data.windows)
    ? (data.windows as Raw[])
        .filter((w) => typeof w?.start === 'string' && typeof w.end === 'string')
        .map((w) => ({ start: w.start as string, end: w.end as string }))
    : [];
  const doc: OverrideDoc = { date, isAvailable: data.isAvailable, windows };
  if (typeof data.reason === 'string' && data.reason) doc.reason = data.reason;
  return doc;
}

/** At least one window a client could book. An empty or all-off week is not bookable. */
export function hasBookableHours(schedule: WeeklyWindow[] | null | undefined): boolean {
  return (schedule ?? []).some((w) => w.isAvailable !== false);
}

function emptyWeek(): WeeklySchedule {
  return Object.fromEntries(DAYS.map((d) => [d, { isAvailable: false, slots: [] }])) as unknown as WeeklySchedule;
}

/** The unsaved proposal a provider with no hours starts from: Mon–Fri 09:00–18:00. */
export function draftWeek(): WeeklySchedule {
  const week = emptyWeek();
  for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayOfWeek[]) {
    week[d] = { isAvailable: true, slots: [{ start: '09:00', end: '18:00' }] };
  }
  return week;
}

function toWeek(schedule: WeeklyWindow[]): WeeklySchedule {
  const week = emptyWeek();
  for (const d of DAYS) {
    const windows = schedule
      .filter((w) => w.dayOfWeek === DAY_INDEX[d])
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    week[d] = {
      isAvailable: windows.some((w) => w.isAvailable !== false),
      slots: windows.map((w) => ({ start: w.startTime, end: w.endTime })),
    };
  }
  return week;
}

function toRules(raw: Partial<BookingRules> | null): BookingRules {
  return { ...DEFAULT_BOOKING_RULES, ...(raw ?? {}) };
}

/**
 * Stored → editor. `isDraft` is true when the provider never saved hours: the editor then
 * opens on the Mon–Fri proposal, which counts for nothing until saved.
 */
export function toSettings(stored: StoredAvailability): { settings: AvailabilitySettings; isDraft: boolean } {
  const isDraft = !stored.schedule || stored.schedule.length === 0;
  const rules = toRules(stored.bookingRules);
  const dateOverrides: DateOverride[] = [...stored.overrides]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({
      id: `override-${o.date}`,
      date: o.date,
      isAvailable: o.isAvailable,
      slots: o.windows,
      reason: o.reason ?? '',
    }));
  return {
    isDraft,
    settings: {
      weeklySchedule: isDraft ? draftWeek() : toWeek(stored.schedule ?? []),
      dateOverrides,
      ...rules,
      timezone: 'Europe/Rome',
    },
  };
}

function toOverrideDoc(o: DateOverride): OverrideDoc {
  const doc: OverrideDoc = { date: o.date, isAvailable: o.isAvailable, windows: o.isAvailable ? o.slots : [] };
  const reason = o.reason?.trim();
  if (reason) doc.reason = reason;
  return doc;
}

function sameOverride(a: OverrideDoc, b: OverrideDoc): boolean {
  return a.isAvailable === b.isAvailable &&
    (a.reason ?? '') === (b.reason ?? '') &&
    a.windows.length === b.windows.length &&
    a.windows.every((w, i) => w.start === b.windows[i].start && w.end === b.windows[i].end);
}

/**
 * Editor → updateMyAvailability. A switched-off day keeps its windows (isAvailable false) so
 * switching it back on restores them. Only new or changed date exceptions are sent; the ones
 * the provider removed are deleted.
 */
export function toUpdate(settings: AvailabilitySettings, loadedOverrides: OverrideDoc[]): AvailabilityUpdate {
  const schedule: WeeklyWindow[] = [];
  for (const d of DAYS) {
    const day = settings.weeklySchedule[d];
    for (const slot of day.slots) {
      schedule.push({ dayOfWeek: DAY_INDEX[d], startTime: slot.start, endTime: slot.end, isAvailable: day.isAvailable });
    }
  }

  const current = settings.dateOverrides.map(toOverrideDoc);
  const loaded = new Map(loadedOverrides.map((o) => [o.date, o]));
  const currentDates = new Set(current.map((o) => o.date));
  return {
    schedule,
    bookingRules: {
      bufferMinutes: settings.bufferMinutes,
      minAdvanceNoticeHours: settings.minAdvanceNoticeHours,
      maxBookingsPerDay: settings.maxBookingsPerDay,
    },
    overrides: {
      upsert: current.filter((o) => {
        const before = loaded.get(o.date);
        return !before || !sameOverride(before, o);
      }),
      delete: loadedOverrides.map((o) => o.date).filter((date) => !currentDates.has(date)),
    },
  };
}

/** What the store keeps as "loaded" after a successful save, so the next diff is right. */
export function savedOverrides(settings: AvailabilitySettings): OverrideDoc[] {
  return settings.dateOverrides.map(toOverrideDoc);
}
```

`src/lib/availability/errors.ts`:

```ts
import type { MessageKey } from '@/i18n/messages';

/**
 * Callable failures, mapped to what the user should read. A callable rejects with a
 * FirebaseError whose `code` is `functions/<status>` and whose `message` is the server's.
 */
function callableError(err: unknown): { code: string; message: string } {
  const e = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  return { code: String(e.code ?? ''), message: String(e.message ?? '') };
}

/** Why updateMyAvailability refused a save. */
export function availabilitySaveErrorKey(err: unknown): MessageKey {
  const { code } = callableError(err);
  if (code === 'functions/invalid-argument') return 'provider.availability.error.invalid';
  if (code === 'functions/failed-precondition') return 'provider.availability.error.noProfile';
  return 'provider.availability.error.save';
}
```

- [ ] **Step 4: i18n** (needed for `MessageKey` in `errors.ts`) — insert after `'provider.availability.subtitle'` in each file:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `provider.availability.draft.title` | `Non hai ancora impostato i tuoi orari` | `You have not set your hours yet` | `Aún no has configurado tu horario` | `Vous n'avez pas encore défini vos horaires` | `Sie haben Ihre Zeiten noch nicht festgelegt` |
| `provider.availability.draft.body` | `Questa è una proposta (lun–ven 9:00–18:00). Non conta finché non la salvi: fino ad allora i clienti non possono prenotarti.` | `This is a suggestion (Mon–Fri 9:00–18:00). It counts for nothing until you save it — until then clients cannot book you.` | `Esto es una propuesta (lun–vie 9:00–18:00). No cuenta hasta que la guardes: hasta entonces los clientes no pueden reservarte.` | `Ceci est une proposition (lun–ven 9h00–18h00). Elle ne compte pas tant que vous ne l'avez pas enregistrée : d'ici là, les clients ne peuvent pas vous réserver.` | `Dies ist ein Vorschlag (Mo–Fr 9:00–18:00). Er gilt erst, wenn Sie ihn speichern – bis dahin können Kunden Sie nicht buchen.` |
| `provider.availability.saved` | `Disponibilità salvata` | `Availability saved` | `Disponibilidad guardada` | `Disponibilités enregistrées` | `Verfügbarkeit gespeichert` |
| `provider.availability.error.load` | `Impossibile caricare la tua disponibilità.` | `Could not load your availability.` | `No se pudo cargar tu disponibilidad.` | `Impossible de charger vos disponibilités.` | `Ihre Verfügbarkeit konnte nicht geladen werden.` |
| `provider.availability.error.save` | `Salvataggio non riuscito. Riprova.` | `Saving failed. Please try again.` | `No se pudo guardar. Inténtalo de nuevo.` | `L'enregistrement a échoué. Veuillez réessayer.` | `Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.` |
| `provider.availability.error.invalid` | `Controlla gli orari: ogni fascia deve iniziare prima di finire e non sovrapporsi alle altre dello stesso giorno.` | `Check your hours: each time range must start before it ends and must not overlap another on the same day.` | `Revisa el horario: cada franja debe empezar antes de terminar y no solaparse con otra del mismo día.` | `Vérifiez vos horaires : chaque créneau doit commencer avant de finir et ne pas chevaucher un autre le même jour.` | `Prüfen Sie Ihre Zeiten: Jeder Zeitraum muss vor seinem Ende beginnen und darf sich nicht mit einem anderen am selben Tag überschneiden.` |
| `provider.availability.error.noProfile` | `Il tuo profilo professionale non è ancora attivo, quindi non puoi impostare orari.` | `Your professional profile is not active yet, so you cannot set hours.` | `Tu perfil profesional aún no está activo, así que no puedes configurar horarios.` | `Votre profil professionnel n'est pas encore actif : vous ne pouvez donc pas définir d'horaires.` | `Ihr Anbieterprofil ist noch nicht aktiv, daher können Sie keine Zeiten festlegen.` |

After `'provider.availabilityEditor.addSlot'`:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `provider.availabilityEditor.removeSlot` | `Rimuovi fascia` | `Remove Slot` | `Eliminar franja` | `Supprimer le créneau` | `Slot entfernen` |

After `'provider.availabilityEditor.settings.timezone'`:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `provider.availabilityEditor.settings.timezoneNote` | `Tutti gli orari sono nel fuso orario italiano (Europe/Rome).` | `All times are Italian time (Europe/Rome).` | `Todos los horarios están en hora italiana (Europe/Rome).` | `Tous les horaires sont à l'heure italienne (Europe/Rome).` | `Alle Zeiten sind italienische Zeit (Europe/Rome).` |

- [ ] **Step 5: Run** `npx vitest run src/lib/availability src/i18n` — expect PASS (adapter 10, errors 1, dates 3, completeness 4).

- [ ] **Step 6: Client reads and save** — replace `src/lib/firebase/availability.ts` with:

```ts
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import {
  overrideFromDoc,
  scheduleFromDoc,
  type AvailabilityUpdate,
  type BookingRules,
  type OverrideDoc,
  type StoredAvailability,
  type WeeklyWindow,
} from '@/lib/availability/adapter';
import { addDaysToKey, romeDateKey } from '@/lib/availability/dates';

/**
 * Provider availability: reads the provider's own instructor doc and date exceptions, writes
 * through updateMyAvailability, and asks getProviderSlots what a client can book. Reads throw
 * (a silent empty result would present a provider's real hours as "none set").
 */

/** The weekly hours alone — null when the provider has no instructor profile. */
export async function fetchMyWeeklySchedule(uid: string): Promise<WeeklyWindow[] | null> {
  const snap = await getDoc(doc(db, 'instructors', uid));
  if (!snap.exists()) return null;
  return scheduleFromDoc(snap.data()) ?? [];
}

/** Everything the availability page edits: weekly hours, rules, and the next 12 months of exceptions. */
export async function fetchMyAvailability(uid: string): Promise<StoredAvailability> {
  const today = romeDateKey(new Date());
  const [instructor, overrides] = await Promise.all([
    getDoc(doc(db, 'instructors', uid)),
    getDocs(
      query(
        collection(db, 'instructors', uid, 'availability'),
        where(documentId(), '>=', today),
        where(documentId(), '<=', addDaysToKey(today, 365)),
      ),
    ),
  ]);
  const data = instructor.data();
  return {
    schedule: scheduleFromDoc(data),
    bookingRules: (data?.bookingRules as Partial<BookingRules> | undefined) ?? null,
    overrides: overrides.docs
      .map((d) => overrideFromDoc(d.id, d.data()))
      .filter((o): o is OverrideDoc => o !== null),
  };
}

export async function saveMyAvailability(update: AvailabilityUpdate): Promise<void> {
  const fn = httpsCallable<AvailabilityUpdate, unknown>(functions, 'updateMyAvailability');
  await fn(update);
}

export interface ProviderSlot {
  time: string; // "HH:mm", Europe/Rome
  startsAt: string; // ISO instant — what createBooking's scheduledAt must be
}

export async function fetchProviderSlots(input: {
  instructorId: string;
  serviceId: string;
  date: string;
}): Promise<ProviderSlot[]> {
  const fn = httpsCallable<typeof input, { slots: ProviderSlot[] }>(functions, 'getProviderSlots');
  return (await fn(input)).data.slots;
}
```

- [ ] **Step 7: Write the failing store test** — `src/stores/providerStore.availability.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1', role: 'provider' } }) },
}));
vi.mock('@/lib/firebase/availability', () => ({
  fetchMyAvailability: vi.fn(),
  saveMyAvailability: vi.fn(),
}));

import { fetchMyAvailability, saveMyAvailability } from '@/lib/firebase/availability';
import { useProviderStore } from './providerStore';

const XMAS = { date: '2026-12-25', isAvailable: false, windows: [], reason: 'Natale' };

beforeEach(() => {
  vi.clearAllMocks();
  useProviderStore.setState({ availability: null, availabilityIsDraft: false, loadedOverrides: [] });
});

describe('providerStore availability', () => {
  it('loads a provider with no hours as an unsaved draft', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: null, bookingRules: null, overrides: [] });
    await useProviderStore.getState().fetchAvailability();

    const s = useProviderStore.getState();
    expect(fetchMyAvailability).toHaveBeenCalledWith('u1');
    expect(s.availabilityIsDraft).toBe(true);
    expect(s.availability?.weeklySchedule.monday.slots).toEqual([{ start: '09:00', end: '18:00' }]);
  });

  it('saves only what changed, then clears the draft flag', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: null, bookingRules: null, overrides: [XMAS] });
    vi.mocked(saveMyAvailability).mockResolvedValue(undefined);
    await useProviderStore.getState().fetchAvailability();

    const settings = useProviderStore.getState().availability!;
    await useProviderStore.getState().updateAvailability(settings);

    const update = vi.mocked(saveMyAvailability).mock.calls[0][0];
    expect(update.schedule).toHaveLength(5); // the Mon–Fri draft, now saved
    expect(update.overrides).toEqual({ upsert: [], delete: [] }); // Christmas unchanged
    expect(useProviderStore.getState().availabilityIsDraft).toBe(false);
  });

  it('rethrows a failed save and keeps the draft flag', async () => {
    vi.mocked(fetchMyAvailability).mockResolvedValue({ schedule: null, bookingRules: null, overrides: [] });
    vi.mocked(saveMyAvailability).mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/invalid-argument' }));
    await useProviderStore.getState().fetchAvailability();

    await expect(useProviderStore.getState().updateAvailability(useProviderStore.getState().availability!))
      .rejects.toThrow('x');
    expect(useProviderStore.getState().availabilityIsDraft).toBe(true);
  });

  it('reports a failed load instead of showing an empty week', async () => {
    vi.mocked(fetchMyAvailability).mockRejectedValue(new Error('permission-denied'));
    await useProviderStore.getState().fetchAvailability();

    expect(useProviderStore.getState().availability).toBeNull();
    expect(useProviderStore.getState().availabilityLoadError).toBe('permission-denied');
  });
});
```

- [ ] **Step 8: Run** `npx vitest run src/stores/providerStore.availability.test.ts` — expect FAIL (store still returns hard-coded defaults; `availabilityIsDraft` missing).

- [ ] **Step 9: Store** — in `src/stores/providerStore.ts`:
  - Remove `updateAvailability,` from the `@/lib/firebase/provider` import list.
  - After `import { useAuthStore } from '@/stores/authStore';` add:

```ts
import { fetchMyAvailability, saveMyAvailability } from '@/lib/firebase/availability';
import { savedOverrides, toSettings, toUpdate, type OverrideDoc } from '@/lib/availability/adapter';
```

  - In `ProviderState`, after `availability: AvailabilitySettings | null;` add:

```ts
  /** The provider never saved hours: `availability` is the unsaved Mon–Fri proposal. */
  availabilityIsDraft: boolean;
  /** Bumped on every load. AvailabilityEditor copies its props once, so it is keyed on this. */
  availabilityVersion: number;
  availabilityLoadError: string | null;
  /** The date exceptions as last loaded or saved — what the next save diffs against. */
  loadedOverrides: OverrideDoc[];
```

  - In the initial state, after `availability: null,` add:

```ts
  availabilityIsDraft: false,
  availabilityVersion: 0,
  availabilityLoadError: null,
  loadedOverrides: [],
```

  - Replace the two actions under `// Availability` (`fetchAvailability` with its hard-coded Mon–Fri default, and `updateAvailability`) with:

```ts
  // Availability
  fetchAvailability: async () => {
    const uid = useAuthStore.getState().user?.id;
    if (!uid) return;
    set({ isLoading: true, availability: null, availabilityLoadError: null });
    try {
      const stored = await fetchMyAvailability(uid);
      const { settings, isDraft } = toSettings(stored);
      set((state) => ({
        availability: settings,
        availabilityIsDraft: isDraft,
        availabilityVersion: state.availabilityVersion + 1,
        loadedOverrides: stored.overrides,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ availabilityLoadError: error.message || 'Failed to fetch availability', isLoading: false });
    }
  },

  /** Saves through updateMyAvailability. Rethrows so the page can say why a save failed. */
  updateAvailability: async (settings: AvailabilitySettings) => {
    set({ isLoading: true });
    try {
      await saveMyAvailability(toUpdate(settings, get().loadedOverrides));
      set({
        availability: settings,
        availabilityIsDraft: false,
        loadedOverrides: savedOverrides(settings),
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
```

- [ ] **Step 10: Retire the `providers/{uid}` write** — in `src/lib/firebase/provider.ts` delete the whole `// Update Availability` block (`export async function updateAvailability(settings: AvailabilitySettings) { … updateDoc(providerRef, { availability: settings, … }) }`) and remove `AvailabilitySettings,` from its `@/types/provider` import. In `src/lib/firebase/index.ts` delete the line `  updateAvailability,` from the `./provider` export list.

- [ ] **Step 11: Run** `npx vitest run src/stores/providerStore.availability.test.ts` — expect PASS (4 tests).

- [ ] **Step 12: Write the failing editor test** — `src/components/provider/AvailabilityEditor.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvailabilityEditor } from './AvailabilityEditor';
import { toSettings } from '@/lib/availability/adapter';

const { settings } = toSettings({
  schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isAvailable: true }],
  bookingRules: null,
  overrides: [{ date: '2026-12-24', isAvailable: false, windows: [] }],
});

describe('AvailabilityEditor date exceptions', () => {
  it('edits custom hours for an exception and saves them', () => {
    const onSave = vi.fn();
    render(<AvailabilityEditor settings={settings} onSave={onSave} />);

    fireEvent.click(screen.getByText('Eccezioni date'));
    fireEvent.click(screen.getByLabelText('Orari personalizzati'));
    // Switching to custom hours seeds one 09:00–17:00 range; move its end to 13:00.
    const [, end] = screen.getAllByRole('combobox'); // [start, end] of that range come first
    fireEvent.change(end, { target: { value: '13:00' } });
    fireEvent.click(screen.getByText('Salva impostazioni disponibilità'));

    expect(onSave.mock.calls[0][0].dateOverrides[0]).toMatchObject({
      date: '2026-12-24',
      isAvailable: true,
      slots: [{ start: '09:00', end: '13:00' }],
    });
  });

  it('does not add a second exception for the same date', () => {
    const { container } = render(<AvailabilityEditor settings={settings} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('Eccezioni date'));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-24' } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi$/ }));

    expect(screen.getAllByPlaceholderText('Motivo (opzionale)')).toHaveLength(1);
  });
});
```

- [ ] **Step 13: Run** `npx vitest run src/components/provider/AvailabilityEditor.test.tsx` — expect both FAIL (custom-hours selects are inert; duplicates are added).

- [ ] **Step 14: Editor fixes** — in `src/components/provider/AvailabilityEditor.tsx` make these replacements.

(a) One exception per date, id from the date. Replace

```tsx
  const addDateOverride = () => {
    if (!newOverrideDate) return;
    
    const newOverride: DateOverride = {
      id: `override-${Date.now()}`,
```

with

```tsx
  const addDateOverride = () => {
    // One exception per date: the server stores them keyed by date.
    if (!newOverrideDate || localSettings.dateOverrides.some((o) => o.date === newOverrideDate)) return;

    const newOverride: DateOverride = {
      id: `override-${newOverrideDate}`,
```

(b) A helper for an exception's ranges — directly above `  const handleSave = () => {` add:

```tsx
  const updateOverrideSlots = (id: string, update: (slots: TimeRange[]) => TimeRange[]) => {
    setLocalSettings(prev => ({
      ...prev,
      dateOverrides: prev.dateOverrides.map(o =>
        o.id === id ? { ...o, slots: update(o.slots) } : o
      ),
    }));
  };

```

(c) Weekly remove button: a label and a 44 px target. Replace

```tsx
                        <button
                          onClick={() => removeTimeSlot(key, index)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
```

with

```tsx
                        <button
                          type="button"
                          onClick={() => removeTimeSlot(key, index)}
                          aria-label={t('provider.availabilityEditor.removeSlot')}
                          className="touch-target flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
```

(d) The exception's date label. Replace

```tsx
                        {new Date(override.date).toLocaleDateString(toLocaleTag(locale), {
```

with

```tsx
                        {/* Noon, not midnight: a bare YYYY-MM-DD parses as UTC and can show the day before. */}
                        {new Date(`${override.date}T12:00:00`).toLocaleDateString(toLocaleTag(locale), {
```

(e) Choosing "custom hours" starts with one range. Replace

```tsx
                            checked={override.isAvailable}
                            onChange={() => updateDateOverride(override.id, { isAvailable: true })}
```

with

```tsx
                            checked={override.isAvailable}
                            onChange={() => updateDateOverride(override.id, {
                              isAvailable: true,
                              slots: override.slots.length > 0 ? override.slots : [{ start: '09:00', end: '17:00' }],
                            })}
```

(f) Working range editors. Replace the block from `{override.slots.map((slot, index) => (` through the opening `<Button variant="secondary" size="sm">` of the add button:

```tsx
                          {override.slots.map((slot, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <select
                                value={slot.start}
                                className="bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>
                              <select
                                value={slot.end}
                                className="bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                          <Button variant="secondary" size="sm">
```

with

```tsx
                          {override.slots.map((slot, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <select
                                value={slot.start}
                                onChange={(e) => updateOverrideSlots(override.id, (slots) =>
                                  slots.map((s, i) => (i === index ? { ...s, start: e.target.value } : s)))}
                                className="min-h-[44px] bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-gray-500">{t('provider.availabilityEditor.slotTo')}</span>
                              <select
                                value={slot.end}
                                onChange={(e) => updateOverrideSlots(override.id, (slots) =>
                                  slots.map((s, i) => (i === index ? { ...s, end: e.target.value } : s)))}
                                className="min-h-[44px] bg-surface-elevated rounded px-2 py-1 text-sm text-white outline-none"
                              >
                                {TIME_OPTIONS.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => updateOverrideSlots(override.id, (slots) => slots.filter((_, i) => i !== index))}
                                aria-label={t('provider.availabilityEditor.removeSlot')}
                                className="touch-target flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => updateOverrideSlots(override.id, (slots) => [...slots, { start: '09:00', end: '17:00' }])}
                          >
```

(g) No per-provider timezone. Replace the timezone `<label>` and `<select>` (the one with the six `Europe/Rome … Asia/Tokyo` options) with:

```tsx
            <p className="block text-sm text-gray-400 mb-2">{t('provider.availabilityEditor.settings.timezone')}</p>
            {/* Every provider is in Italy; the server computes all slots in Europe/Rome. */}
            <p className="py-2.5 text-sm text-white">{t('provider.availabilityEditor.settings.timezoneNote')}</p>
```

- [ ] **Step 15: Run** `npx vitest run src/components/provider/AvailabilityEditor.test.tsx` — expect PASS (2 tests).

- [ ] **Step 16: The page** — replace `src/app/(main)/provider/availability/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { AvailabilityEditor } from '@/components/provider/AvailabilityEditor';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { availabilitySaveErrorKey } from '@/lib/availability/errors';
import type { MessageKey } from '@/i18n/messages';
import type { AvailabilitySettings } from '@/types/provider';

export default function ProviderAvailabilityPage() {
  const { t } = useI18n();
  const {
    availability,
    availabilityIsDraft,
    availabilityVersion,
    availabilityLoadError,
    isLoading,
    fetchAvailability,
    updateAvailability,
  } = useProviderStore();
  const [saveResult, setSaveResult] = useState<{ ok: true } | { ok: false; key: MessageKey } | null>(null);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const handleSave = async (settings: AvailabilitySettings) => {
    setSaveResult(null);
    try {
      await updateAvailability(settings);
      setSaveResult({ ok: true });
    } catch (err) {
      console.error('Saving availability failed:', err);
      setSaveResult({ ok: false, key: availabilitySaveErrorKey(err) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content">{t('provider.availability.title')}</h1>
        <p className="text-gray-400 mt-1">
          {t('provider.availability.subtitle')}
        </p>
      </div>

      {availability && availabilityIsDraft && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/15 p-4">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-warning">{t('provider.availability.draft.title')}</p>
            <p className="mt-1 text-warning/90">{t('provider.availability.draft.body')}</p>
          </div>
        </div>
      )}

      {saveResult?.ok === true && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/15 p-4 text-sm text-success">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {t('provider.availability.saved')}
        </div>
      )}
      {saveResult?.ok === false && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/40 bg-error/15 p-4 text-sm text-error">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {t(saveResult.key)}
        </div>
      )}

      {availability ? (
        <AvailabilityEditor
          key={availabilityVersion}
          settings={availability}
          onSave={handleSave}
          loading={isLoading}
        />
      ) : availabilityLoadError ? (
        <div role="alert" className="rounded-xl border border-error/40 bg-error/15 p-4 text-sm text-error">
          <p>{t('provider.availability.error.load')}</p>
          <Button variant="secondary" size="sm" className="mt-3 min-h-[44px]" onClick={() => fetchAvailability()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 17: Verify** — `npx vitest run src/lib/availability src/stores/providerStore.availability.test.ts src/components/provider src/i18n` (PASS), `npx tsc --noEmit -p .`, `npx eslint src/lib/availability src/lib/firebase/availability.ts src/lib/firebase/provider.ts src/lib/firebase/index.ts src/stores/providerStore.ts src/components/provider "src/app/(main)/provider/availability"` — clean. `grep -rn "updateAvailability" src/lib` must print nothing.

- [ ] **Step 18: Browser check (local, staging backend)** — Task 4's callable is not deployed yet, so only loading is checkable: `npm run dev`, sign in as the staging demo trainer at 375 px, open `/provider/availability`. Expect the draft notice (or the trainer's real hours), the "Eccezioni date" tab working, zero console errors. Do not save.

- [ ] **Step 19: Commit**

```bash
git add src/lib/availability/adapter.ts src/lib/availability/adapter.test.ts src/lib/availability/errors.ts src/lib/availability/errors.test.ts src/lib/firebase/availability.ts src/stores/providerStore.ts src/stores/providerStore.availability.test.ts src/lib/firebase/provider.ts src/lib/firebase/index.ts "src/app/(main)/provider/availability/page.tsx" src/components/provider/AvailabilityEditor.tsx src/components/provider/AvailabilityEditor.test.tsx src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(provider): availability page loads and saves the real schedule"
```

---

### Task 6: `createBooking` enforces availability; the confirm page handles a taken slot

**Files:**
- Modify: `functions/src/availability/slots.ts` (append `decideBookingStart`), `functions/src/bookings/index.ts` (`createBooking`)
- Modify: `src/lib/availability/errors.ts` (append `isSlotUnavailableError`), `src/app/(main)/booking/confirm/page.tsx`
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`
- Test: `functions/src/availability/slots.test.ts`, `src/lib/availability/errors.test.ts`

- [ ] **Step 1: Write the failing tests** — in `functions/src/availability/slots.test.ts` add `decideBookingStart,` to the import list (after `freeSlots,`) and insert before `describe("date helpers"`:

```ts
describe("decideBookingStart", () => {
  const { date: _date, ...base } = q();

  it("accepts a free start", () => {
    expect(decideBookingStart(base, at("10:00"))).toEqual({ ok: true, date: MONDAY, time: "10:00" });
  });

  it("rejects a start outside the provider's hours", () => {
    expect(decideBookingStart(base, at("18:00")).ok).toBe(false);
  });

  it("rejects a start that is already taken", () => {
    const busy = [{ start: at("10:00"), end: at("11:00") }];
    expect(decideBookingStart({ ...base, busy }, at("10:00")).ok).toBe(false);
  });

  it("rejects an instant between two grid points", () => {
    expect(decideBookingStart(base, new Date(at("10:00").getTime() + 60_000)).ok).toBe(false);
  });
});

```

In `src/lib/availability/errors.test.ts` change the import to `import { availabilitySaveErrorKey, isSlotUnavailableError } from './errors';` and append:

```ts
describe('isSlotUnavailableError', () => {
  it('recognises createBooking refusing a taken or outside-hours start', () => {
    expect(isSlotUnavailableError(callableError('functions/failed-precondition', 'slot_unavailable'))).toBe(true);
  });

  it('ignores every other failure', () => {
    expect(isSlotUnavailableError(callableError('functions/failed-precondition', 'something else'))).toBe(false);
    expect(isSlotUnavailableError(callableError('functions/internal', 'slot_unavailable'))).toBe(false);
    expect(isSlotUnavailableError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/availability/slots.test.ts` and `npx vitest run src/lib/availability/errors.test.ts` — expect FAIL (not exported).

- [ ] **Step 3: Implement the decision** — append to `functions/src/availability/slots.ts`:

```ts

/**
 * createBooking's check: is `scheduledAt` exactly one of the day's free starts?
 * An instant between two grid points, or a wall time the day does not have, is not.
 */
export function decideBookingStart(
  q: Omit<SlotQuery, "date">,
  scheduledAt: Date,
): { ok: boolean; date: string; time: string } {
  const date = romeDateOf(scheduledAt);
  const time = romeTimeOf(scheduledAt);
  const exact = romeInstant(date, time).getTime() === scheduledAt.getTime();
  return { ok: exact && freeSlots({ ...q, date }).includes(time), date, time };
}
```

and append to `src/lib/availability/errors.ts`:

```ts

/** createBooking's refusal of a start that is outside the provider's hours or already taken. */
export function isSlotUnavailableError(err: unknown): boolean {
  const { code, message } = callableError(err);
  return code === 'functions/failed-precondition' && message === 'slot_unavailable';
}
```

- [ ] **Step 4: Run** both test files again — expect PASS (slots 22, errors 3).

- [ ] **Step 5: Enforce in `createBooking`** — in `functions/src/bookings/index.ts`:

After `import { isLateCancellation } from "./transitions";` add:

```ts
import { dayContextFrom } from "../availability/dayContext";
import { bookingDayRef, readDayDocs } from "../availability/dayReads";
import { decideBookingStart, romeDateOf } from "../availability/slots";
```

Replace

```ts
    // 3. Prepare Booking Data
    const scheduledDate = new Date(scheduledAt);
    const scheduledEndDate = addMinutes(scheduledDate, service.durationMinutes);
```

with

```ts
    // 3. Prepare Booking Data
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new HttpsError("invalid-argument", "scheduledAt must be an ISO date-time");
    }
    const scheduledEndDate = addMinutes(scheduledDate, service.durationMinutes);
    // Trainer sessions must start on one of the provider's free slots. Venue bookings have
    // no provider schedule behind them and are not checked.
    const trainerId = !venueId && instructorId ? instructorId : null;
```

Replace

```ts
    // 4. Execute Transaction (Create Booking + Update Points + Update Promo)
    await db.runTransaction(async (transaction) => {
      transaction.set(bookingRef, bookingData);
```

with

```ts
    // 4. Execute Transaction (Check Availability + Create Booking + Update Points + Update Promo)
    await db.runTransaction(async (transaction) => {
      if (trainerId) {
        // Reads come first in a transaction. readDayDocs also reads the provider-day lock and
        // the set() below writes it, so concurrent requests for this provider and day queue
        // up: the second one re-reads the bookings and sees the first.
        const day = romeDateOf(scheduledDate);
        const docs = await readDayDocs(db, trainerId, day, transaction);
        const decision = decideBookingStart(
          { ...dayContextFrom(docs), durationMinutes: service.durationMinutes, now: new Date() },
          scheduledDate,
        );
        if (!decision.ok) {
          throw new HttpsError("failed-precondition", "slot_unavailable");
        }
        transaction.set(
          bookingDayRef(db, trainerId, day),
          { lastBookingId: bookingRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      }

      transaction.set(bookingRef, bookingData);
```

Everything else in `createBooking` (permission check, resources, financials, points, promo, return value) stays as it is. An `HttpsError` thrown inside the transaction callback aborts it without retrying and reaches the client unchanged.

- [ ] **Step 6: Verify functions** — `cd functions && npx vitest run src` (all pass), `cd functions && npx tsc --noEmit -p .`, `cd functions && npm run lint`, `cd functions && npm run build` — clean.

- [ ] **Step 7: i18n** — insert after `'booking.availability.loadError'` (added in Task 3) in each file:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `booking.availability.slotTaken` | `Quell'orario è appena stato prenotato. Scegline un altro.` | `That time was just taken. Please pick another.` | `Ese horario acaba de reservarse. Elige otro.` | `Ce créneau vient d'être réservé. Choisissez-en un autre.` | `Dieser Termin wurde gerade vergeben. Bitte wähle einen anderen.` |
| `booking.availability.pickAnother` | `Scegli un altro orario` | `Pick another time` | `Elegir otro horario` | `Choisir un autre créneau` | `Andere Zeit wählen` |

- [ ] **Step 8: Confirm page** — in `src/app/(main)/booking/confirm/page.tsx`:
  - After `import type { PaymentMethod } from '@/types/booking';` add `import { isSlotUnavailableError } from '@/lib/availability/errors';`.
  - After `const [error, setError] = useState<string | null>(null);` add `const [slotTaken, setSlotTaken] = useState(false);`.
  - In `handleCreateBooking`, directly after `setError(null);` add `setSlotTaken(false);` (a retry that fails for another reason must not keep the "pick another time" button).
  - Replace the `catch` of `handleCreateBooking`:

```tsx
    } catch (err: any) {
      setError(err.message || t('bookings.confirm.bookingError'));
      setIsCreating(false);
    }
```

with

```tsx
    } catch (err: any) {
      if (isSlotUnavailableError(err)) {
        // Someone else got there first (or the provider changed their hours).
        setSlotTaken(true);
        setError(t('booking.availability.slotTaken'));
      } else {
        setError(err.message || t('bookings.confirm.bookingError'));
      }
      setIsCreating(false);
    }
```

  - In the `{/* Error */}` block replace

```tsx
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
            <p className="text-sm text-error">{error}</p>
          </motion.div>
```

with

```tsx
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
            <p className="flex-1 text-sm text-error">{error}</p>
            {slotTaken && (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px] flex-shrink-0"
                // Back to the picker: it refetches the day, and the taken time drops out.
                onClick={() => router.replace(`/book?providerId=${selectedProvider.id}`)}
              >
                {t('booking.availability.pickAnother')}
              </Button>
            )}
          </motion.div>
```

- [ ] **Step 9: Verify web** — `npx vitest run src/lib/availability src/i18n` (PASS), `npx tsc --noEmit -p .`, `npx eslint src/lib/availability "src/app/(main)/booking/confirm"` — clean.

- [ ] **Step 10: Commit**

```bash
git add functions/src/availability/slots.ts functions/src/availability/slots.test.ts functions/src/bookings/index.ts src/lib/availability/errors.ts src/lib/availability/errors.test.ts "src/app/(main)/booking/confirm/page.tsx" src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(bookings): createBooking rejects starts outside hours or already taken"
```

---

### Task 7: Dashboard banner and profile link

**Files:**
- Create: `src/components/provider/NoHoursBanner.tsx`
- Modify: `src/app/(main)/provider/dashboard/page.tsx`, `src/app/(main)/profile/page.tsx`, `src/components/profile/index.ts`
- Delete: `src/components/profile/AvailabilityCalendar.tsx`
- Modify: `src/i18n/messages/{it,en,es,fr,de}.ts`
- Test: `src/components/provider/NoHoursBanner.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/components/provider/NoHoursBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NoHoursBanner } from './NoHoursBanner';

describe('NoHoursBanner', () => {
  it('tells the provider to set hours and links to the availability page', () => {
    render(<NoHoursBanner />);
    const link = screen.getByRole('link', { name: /Imposta i tuoi orari per ricevere prenotazioni/ });
    expect(link).toHaveAttribute('href', '/provider/availability');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/provider/NoHoursBanner.test.tsx` — expect FAIL (module not found).

- [ ] **Step 3: i18n** — after `'provider.dashboard.btn.viewCalendar'`:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `provider.dashboard.noHours.title` | `Imposta i tuoi orari per ricevere prenotazioni` | `Set your hours to receive bookings` | `Configura tu horario para recibir reservas` | `Définissez vos horaires pour recevoir des réservations` | `Legen Sie Ihre Zeiten fest, um Buchungen zu erhalten` |
| `provider.dashboard.noHours.body` | `Finché non li imposti, i clienti non possono prenotarti.` | `Until you do, clients cannot book you.` | `Hasta que lo hagas, los clientes no pueden reservarte.` | `Tant que ce n'est pas fait, les clients ne peuvent pas vous réserver.` | `Bis dahin können Kunden Sie nicht buchen.` |

After `'profile.provider.manageServicesHint'`:

| key | it | en | es | fr | de |
|---|---|---|---|---|---|
| `profile.provider.availabilityLink` | `Orari e disponibilità` | `Hours & availability` | `Horario y disponibilidad` | `Horaires et disponibilités` | `Zeiten & Verfügbarkeit` |
| `profile.provider.availabilityHint` | `Imposta quando i clienti possono prenotarti` | `Set when clients can book you` | `Define cuándo pueden reservarte los clientes` | `Définissez quand les clients peuvent vous réserver` | `Lege fest, wann Kunden dich buchen können` |

(The `de` profile strings use "du", like their neighbours; the provider area uses "Sie".)

- [ ] **Step 4: The banner** — `src/components/provider/NoHoursBanner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/** Shown on the provider dashboard while the provider has no bookable hours. */
export function NoHoursBanner() {
  const { t } = useI18n();
  return (
    <Link
      href="/provider/availability"
      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-warning/40 bg-warning/15 p-4 transition-colors hover:bg-warning/20"
    >
      <Clock className="h-5 w-5 flex-shrink-0 text-warning" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-warning">{t('provider.dashboard.noHours.title')}</p>
        <p className="mt-0.5 text-warning/90">{t('provider.dashboard.noHours.body')}</p>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-warning" />
    </Link>
  );
}
```

- [ ] **Step 5: Run** `npx vitest run src/components/provider/NoHoursBanner.test.tsx src/i18n` — expect PASS.

- [ ] **Step 6: Dashboard** — in `src/app/(main)/provider/dashboard/page.tsx`:
  - After `import { useEffect } from 'react';` add `import { useQuery } from '@tanstack/react-query';`.
  - After `import { StatCard } from '@/components/provider/StatCard';` add `import { NoHoursBanner } from '@/components/provider/NoHoursBanner';`.
  - After `import { useProviderStore } from '@/stores/providerStore';` add:

```tsx
import { useAuthStore } from '@/stores/authStore';
import { fetchMyWeeklySchedule } from '@/lib/firebase/availability';
import { hasBookableHours } from '@/lib/availability/adapter';
```

  - Directly after the existing `useEffect` that calls `fetchDashboardStats()` add:

```tsx
  // No hours, no bookings: say so until the provider sets them. staleTime 0 so the banner
  // goes away as soon as they come back from saving.
  const uid = useAuthStore((s) => s.user?.id);
  const { data: weeklySchedule } = useQuery({
    queryKey: ['my-weekly-schedule', uid],
    queryFn: () => fetchMyWeeklySchedule(uid as string),
    enabled: !!uid,
    staleTime: 0,
  });
  // null = no instructor profile at all; that is not something setting hours can fix.
  const needsHours = Array.isArray(weeklySchedule) && !hasBookableHours(weeklySchedule);
```

  - Directly above `{/* Stats Grid */}` add:

```tsx
      {needsHours && <NoHoursBanner />}

```

- [ ] **Step 7: Profile page** — in `src/app/(main)/profile/page.tsx`:
  - Remove `AvailabilityCalendar,` from the `@/components/profile` import.
  - Replace

```tsx
import { isProvider, updateProviderProfile } from '@/lib/firebase/auth';
import { AvailabilitySchedule, ProviderProfile } from '@/types/firebase';
```

  with

```tsx
import { isProvider } from '@/lib/firebase/auth';
```

  - Delete the module-level `const availabilityDayKeys: MessageKey[] = [ … ];` (7 `profile.provider.day.*` entries).
  - Delete, inside the component, `handleUpdateProviderProfile`, `handleUpdateAvailability`, `getAvailabilityPreview` and `const availabilityPreview = getAvailabilityPreview();` (all four exist only for the schedule block).
  - Replace the whole `{/* Availability Preview */}` block — its outer `<div className="bg-background-secondary/5 rounded-xl p-4">` holding the 7-day grid and `<AvailabilityCalendar … />` — with:

```tsx
            {/* Weekly hours. This used to be an editor writing providerProfile.availabilitySchedule
                on the user document, plus a 7-day preview of it. Booking never read that field,
                so hours set here did nothing. It now links to the page that writes the
                schedule booking enforces (instructors/{uid}.availabilitySchedule). */}
            <button
              type="button"
              onClick={() => router.push('/provider/availability')}
              className="w-full bg-background-secondary/5 rounded-xl p-4 text-left hover:bg-background-secondary/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="text-section-primary" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-tertiary">{t('profile.provider.availabilityLink')}</h3>
                  <p className="text-sm text-text-secondary mt-0.5">{t('profile.provider.availabilityHint')}</p>
                </div>
                <ChevronRight className="text-text-tertiary" size={18} />
              </div>
            </button>
```

  (`Calendar`, `ChevronRight`, `cn`, `MessageKey`, `refreshUserProfile` stay imported — they are still used elsewhere in the file.)
- [ ] **Step 8: Delete the old editor** — `git rm src/components/profile/AvailabilityCalendar.tsx` and delete `export { AvailabilityCalendar } from './AvailabilityCalendar';` from `src/components/profile/index.ts`. `grep -rn "AvailabilityCalendar" src` must print nothing. The `profile.provider.day.*`, `profile.provider.availabilityNext7Days`, `profile.provider.slots` and `profile.availability.*` keys become unused; leave them (removing keys is not needed for this change).

- [ ] **Step 9: Verify** — `npx vitest run src/components/provider src/i18n` (PASS), `npx tsc --noEmit -p .`, `npx eslint src/components/provider src/components/profile "src/app/(main)/provider/dashboard" "src/app/(main)/profile/page.tsx"` — clean.

- [ ] **Step 10: Commit** (the `git rm` in Step 8 already staged the deletion)

```bash
git add src/components/provider/NoHoursBanner.tsx src/components/provider/NoHoursBanner.test.tsx "src/app/(main)/provider/dashboard/page.tsx" "src/app/(main)/profile/page.tsx" src/components/profile/index.ts src/i18n/messages/it.ts src/i18n/messages/en.ts src/i18n/messages/es.ts src/i18n/messages/fr.ts src/i18n/messages/de.ts
git commit -m "feat(provider): 'set your hours' banner; profile links to the availability page"
```

---

### Task 8: Firestore rules

**Files:**
- Modify: `firestore.rules` — the `match /availability/{dateId}` block inside `match /instructors/{instructorId}`

- [ ] **Step 1: Edit** — replace

```
      match /availability/{dateId} {
        allow read: if true;
        allow write: if isAdmin() ||
          (isAuthenticated() && get(/databases/$(database)/documents/instructors/$(instructorId)).data.uid == request.auth.uid);
      }
    }
```

with

```
      // Date exceptions to the weekly hours. Public: anyone may see when a provider is off.
      // Written only by the updateMyAvailability callable, which validates them.
      match /availability/{dateId} {
        allow read: if true;
        allow write: if false;
      }

      // Provider-day locks taken by createBooking's availability check. Server-only.
      match /bookingDays/{date} {
        allow read, write: if false;
      }
    }
```

- [ ] **Step 2: Validate** — Firebase MCP `firebase_validate_security_rules` with `type: firestore`, `source_file: firestore.rules`. Expect "No errors detected".

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): bookingDays server-only; availability exceptions written only by the callable"
```

---

### Task 9: `backfillAvailability` migration; stop seeding default hours

**Files:**
- Create: `functions/src/availability/backfillPlan.ts`, `functions/src/availability/backfill.ts`
- Modify: `functions/src/availability/index.ts`
- Modify: `functions/src/ai/migrateInstructors.ts` (~156–165), `functions/scripts/migrate-instructor-catalog.mjs` (~17, ~53–59)
- Test: `functions/src/availability/backfillPlan.test.ts`

- [ ] **Step 1: Write the failing test** — `functions/src/availability/backfillPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cleanSchedule, planAvailabilityBackfill } from "./backfillPlan";

const weekdayMap = {
  monday: { isAvailable: true, slots: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] },
  tuesday: { isAvailable: false, slots: [{ start: "09:00", end: "12:00" }] },
  saturday: { isAvailable: true, slots: [{ start: "10:00", end: "09:00" }, { start: "10:00", end: "12:30" }] },
};

describe("cleanSchedule", () => {
  it("keeps available windows, drops invalid ones and merges overlaps", () => {
    expect(cleanSchedule(weekdayMap)).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", isAvailable: true },
      { dayOfWeek: 6, startTime: "10:00", endTime: "12:30", isAvailable: true },
    ]);
  });

  it("gives nothing for garbage or an all-off week", () => {
    expect(cleanSchedule(null)).toEqual([]);
    expect(cleanSchedule({ monday: { isAvailable: false, slots: [{ start: "09:00", end: "10:00" }] } })).toEqual([]);
  });
});

describe("planAvailabilityBackfill", () => {
  const instructor = { availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }] };

  it("copies a provider-chosen schedule over the seeded default", () => {
    const plan = planAvailabilityBackfill({ providerProfile: { availabilitySchedule: weekdayMap } }, instructor);
    expect(plan).toEqual({ kind: "copy", schedule: cleanSchedule(weekdayMap) });
  });

  it("only clears the users-side field when nothing in it is bookable", () => {
    const user = { providerProfile: { availabilitySchedule: null } };
    expect(planAvailabilityBackfill(user, instructor)).toEqual({ kind: "clear", reason: "nothing_to_copy" });
  });

  it("never overwrites hours saved on the new availability page", () => {
    const user = { providerProfile: { availabilitySchedule: weekdayMap } };
    const saved = { ...instructor, availabilityUpdatedAt: { seconds: 1 } };
    expect(planAvailabilityBackfill(user, saved)).toEqual({ kind: "clear", reason: "kept_newer" });
  });

  it("skips users without the field, deleted users and users with no instructor doc", () => {
    expect(planAvailabilityBackfill({ providerProfile: {} }, instructor))
      .toEqual({ kind: "skip", reason: "not_a_candidate" });
    expect(planAvailabilityBackfill({ isDeleted: true, providerProfile: { availabilitySchedule: weekdayMap } }, instructor))
      .toEqual({ kind: "skip", reason: "deleted" });
    expect(planAvailabilityBackfill({ providerProfile: { availabilitySchedule: weekdayMap } }, undefined))
      .toEqual({ kind: "skip", reason: "no_instructor" });
  });
});
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/availability/backfillPlan.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement the plan** — `functions/src/availability/backfillPlan.ts`:

```ts
import { normalizeAvailability } from "../ai/search/normalize";
import { isTimeKey, toMinutes, type WeeklyWindow } from "./slots";

type Doc = Record<string, unknown>;

export type BackfillAction =
  | { kind: "copy"; schedule: WeeklyWindow[] } // write to instructors, clear the users-side field
  | { kind: "clear"; reason: "nothing_to_copy" | "kept_newer" } // only clear the users-side field
  | { kind: "skip"; reason: "not_a_candidate" | "deleted" | "no_instructor" };

/**
 * The available windows of a legacy schedule, cleaned so updateMyAvailability would accept
 * them: well-formed HH:mm, start before end, and overlapping windows on a day merged.
 */
export function cleanSchedule(raw: unknown): WeeklyWindow[] {
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const w of normalizeAvailability(raw)) {
    if (w.isAvailable === false || w.dayOfWeek < 0 || w.dayOfWeek > 6) continue;
    if (!isTimeKey(w.startTime) || !isTimeKey(w.endTime)) continue;
    const start = toMinutes(w.startTime);
    const end = toMinutes(w.endTime);
    if (start >= end) continue;
    byDay.set(w.dayOfWeek, [...(byDay.get(w.dayOfWeek) ?? []), { start, end }]);
  }

  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const out: WeeklyWindow[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const merged: { start: number; end: number }[] = [];
    for (const w of (byDay.get(day) ?? []).sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last && w.start < last.end) last.end = Math.max(last.end, w.end);
      else merged.push({ ...w });
    }
    for (const w of merged) {
      out.push({ dayOfWeek: day, startTime: hhmm(w.start), endTime: hhmm(w.end), isAvailable: true });
    }
  }
  return out;
}

/**
 * What backfillAvailability does for one user. The users-side weekday map is the one the
 * old profile editor wrote; the provider chose it, so it wins over a seeded default — but
 * not over hours they have since saved on /provider/availability.
 */
export function planAvailabilityBackfill(user: Doc, instructor: Doc | undefined): BackfillAction {
  const profile = (user.providerProfile ?? {}) as Doc;
  if (!("availabilitySchedule" in profile)) return { kind: "skip", reason: "not_a_candidate" };
  if (user.isDeleted === true) return { kind: "skip", reason: "deleted" };
  if (!instructor) return { kind: "skip", reason: "no_instructor" };
  if (instructor.availabilityUpdatedAt) return { kind: "clear", reason: "kept_newer" };

  const schedule = cleanSchedule(profile.availabilitySchedule);
  return schedule.length > 0 ? { kind: "copy", schedule } : { kind: "clear", reason: "nothing_to_copy" };
}
```

- [ ] **Step 4: Run** `cd functions && npx vitest run src/availability/backfillPlan.test.ts` — expect PASS (6 tests).

- [ ] **Step 5: The callable** — `functions/src/availability/backfill.ts`:

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { planAvailabilityBackfill } from "./backfillPlan";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface UserReport {
  uid: string;
  action: "copy" | "clear" | "skip";
  reason?: string;
  windows?: number;
}

/**
 * Superadmin-only, dry-run by default: move the weekly hours the old profile editor wrote
 * (users/{uid}.providerProfile.availabilitySchedule, a weekday map nothing booked against)
 * onto instructors/{uid}.availabilitySchedule, the one schedule booking reads, then remove
 * the users-side field. Providers without it keep what they have: seeded catalogue
 * providers stay bookable on their default hours, recent sign-ups stay unbookable until
 * they set hours. Idempotent: a second run finds no users-side field left.
 */
export const backfillAvailability = onCall<{ dryRun?: boolean }>({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  try {
    await requireSuperAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Superadmin required");
  }

  const dryRun = req.data?.dryRun !== false;
  const db = getFirestore();
  // Admin-created providers carry role 'provider'; self-registered ones may still be
  // 'customer' with a providerStatus. Either can have the old field.
  const [byRole, byStatus] = await Promise.all([
    db.collection("users").where("role", "==", "provider").get(),
    db.collection("users").where("providerStatus", "in", ["pending", "verified"]).get(),
  ]);
  const users = new Map<string, DocumentSnapshot>();
  for (const snap of [...byRole.docs, ...byStatus.docs]) users.set(snap.id, snap);

  const reports: UserReport[] = [];
  for (const [uid, userSnap] of users) {
    const user = userSnap.data() ?? {};
    const instructorRef = db.collection("instructors").doc(uid);
    const instructorSnap = await instructorRef.get();
    const plan = planAvailabilityBackfill(user, instructorSnap.data());
    if (plan.kind === "skip") {
      if (plan.reason !== "not_a_candidate") reports.push({ uid, action: "skip", reason: plan.reason });
      continue;
    }

    const report: UserReport = plan.kind === "copy" ?
      { uid, action: "copy", windows: plan.schedule.length } :
      { uid, action: "clear", reason: plan.reason };
    reports.push(report);
    if (dryRun) continue;

    const batch = db.batch();
    if (plan.kind === "copy") {
      batch.update(instructorRef, {
        availabilitySchedule: plan.schedule,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.update(userSnap.ref, {
      "providerProfile.availabilitySchedule": FieldValue.delete(),
      "updatedAt": FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  const summary = {
    dryRun,
    candidates: reports.length,
    copied: reports.filter((r) => r.action === "copy").length,
    cleared: reports.filter((r) => r.action === "clear").length,
    keptNewer: reports.filter((r) => r.reason === "kept_newer").length,
    skipped: reports.filter((r) => r.action === "skip").length,
  };

  if (!dryRun) {
    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: req.auth?.token?.email ?? "",
      actorRole: "superadmin",
      action: "update",
      entityType: "migration",
      entityId: "availability_backfill",
      after: summary,
      reason: "Move provider-chosen weekly hours from users.providerProfile to instructors.availabilitySchedule",
    });
  }

  return { ...summary, reports };
});
```

In `functions/src/availability/index.ts` add a second line:

```ts
export * from "./backfill";
```

- [ ] **Step 6: Stop seeding default hours** — in `functions/src/ai/migrateInstructors.ts` replace

```ts
    // availabilitySchedule (flat canonical array, ADDED for AI search). Only
    // write when the existing array is missing/empty — never overwrite a valid
    // existing schedule (idempotency).
    const existingAvailability = normalizeAvailability(data.availabilitySchedule);
    if (existingAvailability.length === 0) {
      const normalized = normalizeAvailability(
        data.availabilitySchedule ?? pp.availabilitySchedule ?? {},
      );
      patch.availabilitySchedule = normalized.length ? normalized : defaultWeeklySchedule();
    }
```

with

```ts
    // availabilitySchedule (flat canonical array). Only write when the existing array is
    // missing/empty — never overwrite a valid existing schedule (idempotency) — and never
    // invent one: a provider with no hours is not bookable until they set them
    // (docs/superpowers/specs/2026-09-19-provider-availability-design.md).
    const existingAvailability = normalizeAvailability(data.availabilitySchedule);
    if (existingAvailability.length === 0) {
      const normalized = normalizeAvailability(
        data.availabilitySchedule ?? pp.availabilitySchedule ?? {},
      );
      if (normalized.length) patch.availabilitySchedule = normalized;
    }
```

and delete the now-unused `import { defaultWeeklySchedule } from "./catalog";` (`defaultWeeklySchedule` itself stays in `catalog.ts`; the seeder uses it). In `functions/scripts/migrate-instructor-catalog.mjs` make the same change: line 17 becomes `const { userTypeForSpecialty } = require("../lib/ai/catalog.js");`, and `patch.availabilitySchedule = normalized.length ? normalized : defaultWeeklySchedule();` becomes `if (normalized.length) patch.availabilitySchedule = normalized;`.

- [ ] **Step 7: Verify** — `cd functions && npx vitest run src` (all pass: 35 files), `cd functions && npx tsc --noEmit -p .`, `cd functions && npm run lint`, `cd functions && npm run build` — clean. `node --check functions/scripts/migrate-instructor-catalog.mjs` — no output.

- [ ] **Step 8: Commit**

```bash
git add functions/src/availability/backfillPlan.ts functions/src/availability/backfillPlan.test.ts functions/src/availability/backfill.ts functions/src/availability/index.ts functions/src/ai/migrateInstructors.ts functions/scripts/migrate-instructor-catalog.mjs
git commit -m "feat(availability): backfillAvailability migration; catalogue migration no longer invents hours"
```

---

### Task 10: Staging, then production (controller, not a subagent)

Callables are exercised from the signed-in page with Playwright `browser_evaluate`. This installs `window.__call(name, data)` using the page's own Firebase session (set `PROJECT` to `vfit-app-staging` or `vfit-funlife`); the callable protocol answers `{ result }` or `{ error: { status, message } }`:

```js
async () => {
  const PROJECT = 'vfit-app-staging';
  const open = indexedDB.open('firebaseLocalStorageDb');
  const idb = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const rows = await new Promise((res) => {
    const req = idb.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => res(req.result);
  });
  const token = rows.find((r) => r.fbase_key.startsWith('firebase:authUser:')).value.stsTokenManager.accessToken;
  window.__call = async (name, data) => {
    const r = await fetch(`https://europe-west1-${PROJECT}.cloudfunctions.net/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    });
    return r.json();
  };
  return 'ok';
}
```

**Staging**

- [ ] `git branch --show-current` (main), `git status`, `git log --oneline origin/main..HEAD` — only this plan's commits (plus any foreign ones you have reviewed). `git push origin main`.
- [ ] Deploy: `firebase deploy -P staging --only functions:getProviderSlots,functions:updateMyAvailability,functions:backfillAvailability,functions:createBooking,functions:migrateInstructorCatalog,firestore:rules,firestore:indexes` (the functions predeploy runs lint + build), then `npm run build:staging && firebase deploy -P staging --only hosting`.
- [ ] Preflight: `for f in getProviderSlots updateMyAvailability backfillAvailability createBooking; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS -H "Origin: https://vfit-app-staging.web.app" -H "Access-Control-Request-Method: POST" https://europe-west1-vfit-app-staging.cloudfunctions.net/$f; done` — every line 204.
- [ ] Look up (Firestore MCP, staging) the demo trainer's uid (`users` where `email == demo.trainer@vitfitdemo.dev`) and one active 60-minute service id under `instructors/{uid}/services`. Create two throwaway customers through https://vfit-app-staging.web.app/auth/register (e.g. `avail.smoke.a@vitfitdemo.dev`, `avail.smoke.b@vitfitdemo.dev`). Let **D** = the first Monday at least three days ahead.
- [ ] **Provider, 375 px, https://vfit-app-staging.web.app:** sign in as `demo.trainer@vitfitdemo.dev`. `/provider/dashboard` shows the "Imposta i tuoi orari…" banner iff the trainer has no bookable hours; tapping it opens `/provider/availability`. Set Monday on with one range 10:00–13:00, every other day off, "Tempo cuscinetto" 15 min, "Preavviso minimo" 24 h. On "Eccezioni date" add D + 7 as "Non disponibile" with reason "Test". Save → "Disponibilità salvata". Reload → same values, no draft notice. Firestore: `instructors/{uid}` has `availabilitySchedule` containing `{ dayOfWeek: 1, startTime: "10:00", endTime: "13:00", isAvailable: true }`, `bookingRules`, `availabilityUpdatedAt`; `instructors/{uid}/availability/{D+7}` is `{ isAvailable: false, windows: [], reason: "Test", date }`. Then set a Monday range 13:00–12:00, save → "Controlla gli orari…" error; put it back. `/profile` shows "Orari e disponibilità" linking to `/provider/availability`. Dashboard banner gone.
- [ ] **Customer A, 375 px:** `/booking` → search the demo trainer → open → pick the 60-minute service → date D. Slots exactly 10:00, 10:30, 11:00, 11:30, 12:00; D + 7 and any Tuesday → "Nessun orario disponibile". Book 10:00 → confirm → booking detail. Firestore: `scheduledAt` is 10:00 Rome on D; `instructors/{uid}/bookingDays/{D}` exists with `lastBookingId`. Before signing out, keep A's ID token for the race step below: run the `__call` installer and also `return` the `token` it reads (valid one hour) — Playwright shares one browser session, so A cannot stay signed in next to B.
- [ ] **Customer B, 375 px:** same flow, date D → only 11:30 and 12:00 (10:00 taken; 10:30 overlaps; 11:00 is inside the 15-minute buffer). Install `__call` and check: `__call('createBooking', { instructorId: UID, serviceId: SID, scheduledAt: <A's startsAt>, bookingType: 'in_venue' })` and the same with D 15:00 Rome (`<D>T15:00:00+02:00`, or `+01:00` in winter) — both `{ error: { status: 'FAILED_PRECONDITION', message: 'slot_unavailable' } }`.
- [ ] **Slot taken at confirm time:** as B select D 11:30 and reach `/booking/confirm`. Then, as A, from Bash with A's saved token: `curl -s -X POST https://europe-west1-vfit-app-staging.cloudfunctions.net/getProviderSlots -H "Authorization: Bearer $A_TOKEN" -H "Content-Type: application/json" -d '{"data":{"instructorId":"UID","serviceId":"SID","date":"D"}}'` to read 11:30's `startsAt`, and the same `curl` against `createBooking` with `{"data":{"instructorId":"UID","serviceId":"SID","scheduledAt":"<startsAt>","bookingType":"in_venue"}}`. Back in the browser as B press confirm → "Quell'orario è appena stato prenotato…" + "Scegli un altro orario" → back on `/book`, the day refetched, 11:30 gone.
- [ ] **Signed out:** fresh context, `/book?providerId=UID`, pick the service and D → "Accedi per vedere gli orari disponibili." with an "Accedi" link.
- [ ] No console errors on any screen above except the expected ones from deliberate rejections (the invalid-range save logs "Saving availability failed", and each `slot_unavailable` answer is a 400 the browser logs). Cancel the smoke bookings from each customer's `/bookings`.
- [ ] **Migration on staging:** as `admin@vfit.com`, install `__call`, run `__call('backfillAvailability', {})` → dry-run report (`dryRun: true`, counts, per-user `reports`). Run `__call('backfillAvailability', { dryRun: false })`; check copied providers' `instructors/{uid}.availabilitySchedule` and that `users/{uid}.providerProfile.availabilitySchedule` is gone; `audit_logs` has `entityType: 'migration'`, `entityId: 'availability_backfill'`. A second dry run reports `candidates: 0` (or only `skip` rows).

**Production** — only if every staging step passed.

- [ ] `git fetch && git log --oneline origin/main -15` — review any commit not from this plan before deploying (a shared checkout ships everything committed). Push if needed.
- [ ] Read-only pre-check (Firestore MCP, production): list verified instructors without `activityKind` whose `availabilitySchedule` has no entry with `isAvailable !== false`. They become unbookable at deploy; include the count in the report to the user.
- [ ] Deploy the same function list plus `firestore:rules,firestore:indexes` with `-P production`, then `npm run build:prod && firebase deploy -P production --only hosting` (never plain `npm run build` — `.env.local` points at staging).
- [ ] Preflight sweep against `https://europe-west1-vfit-funlife.cloudfunctions.net/…` with origin `https://vfit-funlife.web.app` — all 204.
- [ ] Read-only check at 375 px: sign in as the production demo trainer, open `/provider/availability` (loads; do not save) and `/book` for a seeded catalogue provider → a weekday shows 09:00–12:00 / 14:00–18:00 slots. No bookings in production.
- [ ] As a production superadmin (ask the user to sign in if no credentials are at hand), `__call('backfillAvailability', {})` with `PROJECT = 'vfit-funlife'` — **dry run only**. Report to the user: copied / cleared / keptNewer / skipped, the per-user list, and the pre-check count. **Stop.** Run `{ dryRun: false }` only on the user's go, then a second dry run to confirm nothing is left.
- [ ] Report what went to each environment, including two rollout caveats: during the minutes between the functions deploy and the hosting deploy, an old open or cached web client still shows the old "everyone free" picker, and its bookings are refused with the raw text `slot_unavailable`; installed Capacitor apps keep the old bundle (and that behaviour) until the next native release.

---

## Open questions

1. **Rescheduling is broken independently of this plan.** `rescheduleBooking` (`src/lib/firebookings.ts`) updates `scheduledAt` from the client, which `firestore.rules` denies for customers, and it never checked availability. The page also calls `fetchAvailability(booking.providerId, …)` although bookings store `instructorId`. Task 3 only keeps it compiling. A server-side reschedule callable reusing `decideBookingStart` (excluding the booking being moved) would be the fix — a separate change?
2. **`/book?providerId=…` opened directly cannot reach confirmation**: `BookingClient` never sets `selectedProvider`, so `/booking/confirm` shows "no booking". Pre-existing; the staging steps go through `/booking` search to avoid it. Fix it here or separately?
3. **The demo seeder still writes `users/{uid}.providerProfile.availabilitySchedule`** for seeded users (`functions/src/seed/seedData.ts` ~205). Nothing reads it after this change; a reseed would only re-create the retired field. Leave, or strip it from the seeder?
4. **Production goes dark for providers with no hours at deploy time** (the decision, but outward-facing): the Task 10 pre-check lists them. Should they be notified (e.g. a push "imposta i tuoi orari") — out of this plan's scope?
