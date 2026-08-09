/**
 * Pure metric computation.
 *
 * No Firestore, no clock of its own — everything is passed in. That keeps every definition
 * in the spec unit-testable, which matters more here than anywhere else in the codebase:
 * these numbers drive partner decisions, and a wrong one is worse than a missing one.
 *
 * Spec: docs/superpowers/specs/2026-08-09-metrics-dashboard-design.md §5
 */

import {
  ACTIVE_TRAINER_WINDOW_DAYS,
  MAX_TRAINERS_IN_MAP,
  MIN_REBOOKING_COHORT,
  REBOOKING_WINDOW_DAYS,
  type MetricsBooking,
  type MetricsDaily,
  type MetricsUser,
  type TrainerMetrics,
} from "./types";
import type { BookingStatus } from "../bookings/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in the given IANA zone. Day boundaries must be local: a UTC boundary would
 *  split Italian evening sessions across two days and skew the weekly chart. */
export function dateKeyInZone(date: Date, timeZone = "Europe/Rome"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First `statusHistory` entry with the given status, or undefined. */
function firstEntry(booking: MetricsBooking, status: BookingStatus) {
  return booking.statusHistory.find((h) => h.status === status);
}

function entriesOn(booking: MetricsBooking, status: BookingStatus, dateKey: string, tz: string) {
  return booking.statusHistory.filter(
    (h) => h.status === status && dateKeyInZone(h.at, tz) === dateKey,
  );
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Of clients whose FIRST completed session is at least 30 days old, the share who had a
 * second completed session within 30 days of the first.
 *
 * Clients whose first session is more recent are excluded: they have not had the chance to
 * rebook yet, and counting them as failures would drag the rate toward zero exactly when
 * the pilot is growing fastest. Returns null below a floor cohort, where the number would
 * swing wildly on a single client.
 */
export function computeRebookingRate(
  bookings: MetricsBooking[],
  asOf: Date,
): { rate: number | null; cohortSize: number } {
  const completedByClient = new Map<string, Date[]>();

  for (const b of bookings) {
    const completed = firstEntry(b, "completed");
    if (!completed) continue;
    const list = completedByClient.get(b.userId) ?? [];
    list.push(completed.at);
    completedByClient.set(b.userId, list);
  }

  let eligible = 0;
  let rebooked = 0;

  for (const dates of completedByClient.values()) {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    // Not yet had a full window to rebook — excluded rather than counted as a failure.
    if (asOf.getTime() - first.getTime() < REBOOKING_WINDOW_DAYS * DAY_MS) continue;

    eligible++;
    const second = sorted[1];
    if (second && second.getTime() - first.getTime() <= REBOOKING_WINDOW_DAYS * DAY_MS) {
      rebooked++;
    }
  }

  if (eligible < MIN_REBOOKING_COHORT) return { rate: null, cohortSize: eligible };
  return { rate: rebooked / eligible, cohortSize: eligible };
}

/**
 * Cancellations initiated by the trainer, on the given day.
 *
 * Keys on actorRole, NOT on the status. An admin cancelling a booking also writes
 * `cancelled_by_trainer` (the enum has two cancellation states, `cancelledBy` has five),
 * so counting by status alone blames trainers for admin actions. Spec §4.
 */
export function countTrainerCancellations(
  bookings: MetricsBooking[],
  dateKey: string,
  tz: string,
): number {
  let n = 0;
  for (const b of bookings) {
    const hit = b.statusHistory.some(
      (h) =>
        h.status === "cancelled_by_trainer" &&
        h.actorRole === "trainer" &&
        dateKeyInZone(h.at, tz) === dateKey,
    );
    if (hit) n++;
  }
  return n;
}

export interface ComputeArgs {
  dateKey: string;
  /** End of the day being computed — the "as of" instant for rolling values. */
  asOf: Date;
  bookings: MetricsBooking[];
  users: MetricsUser[];
  timeZone?: string;
}

export function computeMetricsForDay(args: ComputeArgs): MetricsDaily {
  const { dateKey, asOf, bookings, users } = args;
  const tz = args.timeZone ?? "Europe/Rome";

  // Only events up to the end of this day count toward cumulative values, so recomputing
  // an old day yields the same numbers it did originally.
  const upTo = (d: Date) => d.getTime() <= asOf.getTime();

  const sessionsRequested = bookings.filter((b) => entriesOn(b, "requested", dateKey, tz).length).length;
  const sessionsAccepted = bookings.filter((b) => entriesOn(b, "accepted", dateKey, tz).length).length;
  const sessionsCompleted = bookings.filter((b) => entriesOn(b, "completed", dateKey, tz).length).length;

  const paidToday = bookings.filter((b) => entriesOn(b, "payment_confirmed", dateKey, tz).length);
  const sessionsPaymentConfirmed = paidToday.length;
  // The amount actually received, not the listed price — the trainer can edit it and pilot
  // GMV has to reflect what changed hands.
  const grossValue = paidToday.reduce((sum, b) => sum + (b.paymentConfirmation?.amount ?? 0), 0);

  const lateCancellations = bookings.filter(
    (b) =>
      b.lateCancellation === true &&
      b.statusHistory.some(
        (h) => h.status.startsWith("cancelled_") && dateKeyInZone(h.at, tz) === dateKey,
      ),
  ).length;

  const trainerCancellations = countTrainerCancellations(bookings, dateKey, tz);

  // --- rolling / cumulative ---
  const activeSince = new Date(asOf.getTime() - ACTIVE_TRAINER_WINDOW_DAYS * DAY_MS);
  const activeTrainerIds = new Set<string>();
  for (const b of bookings) {
    if (!b.instructorId) continue;
    const recent = b.statusHistory.some(
      (h) => h.status === "accepted" && upTo(h.at) && h.at.getTime() >= activeSince.getTime(),
    );
    if (recent) activeTrainerIds.add(b.instructorId);
  }

  const visibleUsers = users.filter((u) => !u.hidden);
  const totalTrainers = visibleUsers.filter((u) => u.role === "provider").length;
  const clients = visibleUsers.filter((u) => u.role === "customer");

  const newClients = clients.filter(
    (u) => u.createdAt && dateKeyInZone(u.createdAt, tz) === dateKey,
  ).length;

  const completedUpTo = bookings.filter((b) => {
    const e = firstEntry(b, "completed");
    return e && upTo(e.at);
  });
  const paidUpTo = bookings.filter((b) => {
    const e = firstEntry(b, "payment_confirmed");
    return e && upTo(e.at);
  });

  const cumulativeGrossValue = paidUpTo.reduce(
    (sum, b) => sum + (b.paymentConfirmation?.amount ?? 0), 0,
  );

  // Median over bookings ACCEPTED today: hours from the request to the acceptance.
  const acceptLags: number[] = [];
  for (const b of bookings) {
    const accepted = entriesOn(b, "accepted", dateKey, tz)[0];
    const requested = firstEntry(b, "requested");
    if (accepted && requested) {
      const hours = (accepted.at.getTime() - requested.at.getTime()) / (60 * 60 * 1000);
      if (hours >= 0) acceptLags.push(hours);
    }
  }

  const { rate: rebookingRate } = computeRebookingRate(
    bookings.filter((b) => {
      const e = firstEntry(b, "completed");
      return e && upTo(e.at);
    }),
    asOf,
  );

  const clientsWithRequest = new Set(
    bookings.filter((b) => firstEntry(b, "requested") && upTo(firstEntry(b, "requested")!.at))
      .map((b) => b.userId),
  ).size;
  const clientsWithCompleted = new Set(completedUpTo.map((b) => b.userId)).size;

  const disputes = bookings.filter(
    (b) => b.paymentConfirmation?.clientResponse === "disputed",
  ).length;

  // --- per trainer, trailing 30 days ---
  const byTrainerAll = new Map<string, TrainerMetrics>();
  for (const b of bookings) {
    if (!b.instructorId) continue;
    const t = byTrainerAll.get(b.instructorId) ?? {
      name: b.instructorName ?? b.instructorId,
      accepted: 0, completed: 0, paymentConfirmed: 0, grossValue: 0, lastAcceptedAt: null,
    };

    for (const h of b.statusHistory) {
      if (!upTo(h.at)) continue;
      const inWindow = h.at.getTime() >= activeSince.getTime();
      if (h.status === "accepted") {
        if (inWindow) t.accepted++;
        if (!t.lastAcceptedAt || h.at > t.lastAcceptedAt) t.lastAcceptedAt = h.at;
      }
      if (h.status === "completed" && inWindow) t.completed++;
      if (h.status === "payment_confirmed" && inWindow) {
        t.paymentConfirmed++;
        t.grossValue += b.paymentConfirmation?.amount ?? 0;
      }
    }
    byTrainerAll.set(b.instructorId, t);
  }

  const byTrainerTruncated = byTrainerAll.size > MAX_TRAINERS_IN_MAP;
  const byTrainer: Record<string, TrainerMetrics> = {};
  for (const [uid, t] of [...byTrainerAll.entries()].slice(0, MAX_TRAINERS_IN_MAP)) {
    byTrainer[uid] = t;
  }

  return {
    dateKey,
    sessionsRequested,
    sessionsAccepted,
    sessionsCompleted,
    sessionsPaymentConfirmed,
    grossValue,
    newClients,
    lateCancellations,
    trainerCancellations,
    activeTrainers: activeTrainerIds.size,
    totalTrainers,
    cumulativeCompleted: completedUpTo.length,
    cumulativePaymentConfirmed: paidUpTo.length,
    cumulativeGrossValue,
    rebookingRate,
    medianTimeToAcceptHours: median(acceptLags),
    disputes,
    funnel: {
      registeredClients: clients.filter((u) => !u.createdAt || upTo(u.createdAt)).length,
      clientsWithRequest,
      clientsWithCompleted,
    },
    byTrainer,
    byTrainerTruncated,
  };
}
