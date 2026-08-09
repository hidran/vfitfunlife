import { describe, it, expect } from "vitest";
import {
  computeMetricsForDay,
  computeRebookingRate,
  countTrainerCancellations,
  dateKeyInZone,
  median,
} from "../src/metrics/compute";
import type { MetricsBooking, MetricsUser } from "../src/metrics/types";
import type { BookingStatus, StatusActorRole } from "../src/bookings/types";

const TZ = "Europe/Rome";
const DAY = "2026-08-09";
const endOfDay = new Date("2026-08-09T21:59:59Z"); // 23:59:59 Europe/Rome

type H = { status: BookingStatus; actorUid: string; actorRole: StatusActorRole; at: Date };

function booking(over: Partial<MetricsBooking> & { id: string }): MetricsBooking {
  return {
    userId: "client1",
    instructorId: "trainer1",
    instructorName: "Marco",
    status: "requested",
    statusHistory: [],
    ...over,
  };
}

function h(status: BookingStatus, at: string, actorRole: StatusActorRole = "trainer"): H {
  return { status, actorUid: `${actorRole}-uid`, actorRole, at: new Date(at) };
}

const noUsers: MetricsUser[] = [];

describe("dateKeyInZone", () => {
  it("uses the local day, not UTC — an Italian evening session stays on its own day", () => {
    // 22:30 Rome on the 9th is 20:30 UTC on the 9th; but 23:30 Rome is 21:30 UTC same day.
    expect(dateKeyInZone(new Date("2026-08-09T21:30:00Z"), TZ)).toBe("2026-08-09");
    // 00:30 Rome on the 10th is 22:30 UTC on the 9th — must be the 10th locally.
    expect(dateKeyInZone(new Date("2026-08-09T22:30:00Z"), TZ)).toBe("2026-08-10");
  });
});

describe("median", () => {
  it("returns null for an empty set rather than NaN", () => {
    expect(median([])).toBeNull();
  });
  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("takes the middle value for an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("is not dragged by a single outlier the way a mean would be", () => {
    expect(median([1, 1, 1, 1, 500])).toBe(1);
  });
});

describe("gross value", () => {
  it("uses the amount actually received, not the listed price", () => {
    const b = booking({
      id: "b1",
      status: "payment_confirmed",
      finalPrice: 50,
      paymentConfirmation: { amount: 35, clientResponse: null },
      statusHistory: [h("payment_confirmed", "2026-08-09T10:00:00Z")],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.grossValue).toBe(35);
    expect(m.grossValue).not.toBe(50);
  });

  it("is zero, not NaN, when a confirmation carries no amount", () => {
    const b = booking({
      id: "b1", status: "payment_confirmed",
      statusHistory: [h("payment_confirmed", "2026-08-09T10:00:00Z")],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.grossValue).toBe(0);
  });
});

describe("cancellation attribution (spec §4)", () => {
  const adminCancelled = booking({
    id: "b1", status: "cancelled_by_trainer",
    statusHistory: [h("cancelled_by_trainer", "2026-08-09T10:00:00Z", "admin")],
  });
  const trainerCancelled = booking({
    id: "b2", status: "cancelled_by_trainer",
    statusHistory: [h("cancelled_by_trainer", "2026-08-09T11:00:00Z", "trainer")],
  });

  it("does NOT count an admin cancellation as a trainer cancellation", () => {
    expect(countTrainerCancellations([adminCancelled], DAY, TZ)).toBe(0);
  });

  it("counts a genuine trainer cancellation", () => {
    expect(countTrainerCancellations([trainerCancelled], DAY, TZ)).toBe(1);
  });

  it("separates them when both are present — the whole point of the rule", () => {
    const m = computeMetricsForDay({
      dateKey: DAY, asOf: endOfDay,
      bookings: [adminCancelled, trainerCancelled], users: noUsers,
    });
    expect(m.trainerCancellations).toBe(1);
  });

  it("ignores a migration-synthesised entry, which has no real actor", () => {
    const migrated = booking({
      id: "b3", status: "cancelled_by_trainer",
      statusHistory: [{
        status: "cancelled_by_trainer", actorUid: "migration",
        actorRole: "system", at: new Date("2026-08-09T09:00:00Z"),
      }],
    });
    expect(countTrainerCancellations([migrated], DAY, TZ)).toBe(0);
  });
});

describe("rebooking rate", () => {
  const asOf = new Date("2026-08-09T22:00:00Z");
  const long = (days: number) => new Date(asOf.getTime() - days * 86400000).toISOString();

  function client(id: string, firstDaysAgo: number, secondDaysAfterFirst?: number): MetricsBooking[] {
    const first = booking({
      id: `${id}-1`, userId: id, status: "completed",
      statusHistory: [h("completed", long(firstDaysAgo))],
    });
    if (secondDaysAfterFirst === undefined) return [first];
    return [first, booking({
      id: `${id}-2`, userId: id, status: "completed",
      statusHistory: [h("completed", long(firstDaysAgo - secondDaysAfterFirst))],
    })];
  }

  it("excludes clients whose first session is too recent to have rebooked", () => {
    const bookings = [...client("c1", 5), ...client("c2", 10)];
    const { rate, cohortSize } = computeRebookingRate(bookings, asOf);
    expect(cohortSize).toBe(0);
    expect(rate).toBeNull();
  });

  it("returns null below the floor cohort rather than a swingy percentage", () => {
    const bookings = [...client("c1", 60, 5), ...client("c2", 60)];
    expect(computeRebookingRate(bookings, asOf).rate).toBeNull();
  });

  it("computes the rate once the cohort is large enough", () => {
    const bookings = [
      ...client("c1", 60, 5), ...client("c2", 60, 10), ...client("c3", 60),
      ...client("c4", 60), ...client("c5", 60),
    ];
    const { rate, cohortSize } = computeRebookingRate(bookings, asOf);
    expect(cohortSize).toBe(5);
    expect(rate).toBeCloseTo(2 / 5);
  });

  it("does not count a second session outside the 30-day window", () => {
    const bookings = [
      ...client("c1", 90, 45), ...client("c2", 90), ...client("c3", 90),
      ...client("c4", 90), ...client("c5", 90),
    ];
    expect(computeRebookingRate(bookings, asOf).rate).toBe(0);
  });
});

describe("median time to accept", () => {
  it("measures request → acceptance in hours", () => {
    const b = booking({
      id: "b1", status: "accepted",
      statusHistory: [
        h("requested", "2026-08-09T06:00:00Z", "client"),
        h("accepted", "2026-08-09T10:00:00Z"),
      ],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.medianTimeToAcceptHours).toBe(4);
  });

  it("is null when nothing was accepted that day", () => {
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [], users: noUsers });
    expect(m.medianTimeToAcceptHours).toBeNull();
  });
});

describe("active trainers", () => {
  it("counts a trainer with an acceptance inside the 30-day window", () => {
    const b = booking({
      id: "b1", instructorId: "t1",
      statusHistory: [h("accepted", "2026-08-01T10:00:00Z")],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.activeTrainers).toBe(1);
  });

  it("does not count one whose last acceptance is older than the window", () => {
    const b = booking({
      id: "b1", instructorId: "t1",
      statusHistory: [h("accepted", "2026-05-01T10:00:00Z")],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.activeTrainers).toBe(0);
  });

  it("counts each trainer once regardless of booking volume", () => {
    const bs = [1, 2, 3].map((i) => booking({
      id: `b${i}`, instructorId: "t1",
      statusHistory: [h("accepted", "2026-08-05T10:00:00Z")],
    }));
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: bs, users: noUsers });
    expect(m.activeTrainers).toBe(1);
  });
});

describe("users", () => {
  const users: MetricsUser[] = [
    { uid: "p1", role: "provider", createdAt: new Date("2026-07-01T10:00:00Z") },
    { uid: "p2", role: "provider", createdAt: new Date("2026-07-01T10:00:00Z"), hidden: true },
    { uid: "c1", role: "customer", createdAt: new Date("2026-08-09T10:00:00Z") },
    { uid: "c2", role: "customer", createdAt: new Date("2026-07-01T10:00:00Z") },
  ];

  it("excludes hidden (demo / soft-deleted) accounts from trainer counts", () => {
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [], users });
    expect(m.totalTrainers).toBe(1);
  });

  it("counts only clients created that day as new", () => {
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [], users });
    expect(m.newClients).toBe(1);
  });
});

describe("recomputing an earlier day", () => {
  it("ignores events after that day, so a rerun reproduces the original numbers", () => {
    const b = booking({
      id: "b1", status: "payment_confirmed",
      paymentConfirmation: { amount: 40, clientResponse: null },
      statusHistory: [
        h("completed", "2026-08-09T10:00:00Z"),
        h("payment_confirmed", "2026-08-20T10:00:00Z"), // later than the day computed
      ],
    });
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [b], users: noUsers });
    expect(m.cumulativeCompleted).toBe(1);
    expect(m.cumulativePaymentConfirmed).toBe(0);
    expect(m.cumulativeGrossValue).toBe(0);
  });
});

describe("empty input", () => {
  it("produces zeros and nulls, never NaN", () => {
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings: [], users: [] });
    for (const v of [
      m.sessionsRequested, m.sessionsAccepted, m.sessionsCompleted,
      m.sessionsPaymentConfirmed, m.grossValue, m.activeTrainers, m.cumulativeGrossValue,
    ]) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBe(0);
    }
    expect(m.rebookingRate).toBeNull();
    expect(m.medianTimeToAcceptHours).toBeNull();
  });
});

describe("funnel", () => {
  it("narrows from registered to requested to completed", () => {
    const users: MetricsUser[] = [
      { uid: "c1", role: "customer", createdAt: new Date("2026-07-01T00:00:00Z") },
      { uid: "c2", role: "customer", createdAt: new Date("2026-07-01T00:00:00Z") },
      { uid: "c3", role: "customer", createdAt: new Date("2026-07-01T00:00:00Z") },
    ];
    const bookings = [
      booking({ id: "b1", userId: "c1", statusHistory: [h("requested", "2026-08-01T10:00:00Z", "client"), h("completed", "2026-08-02T10:00:00Z")] }),
      booking({ id: "b2", userId: "c2", statusHistory: [h("requested", "2026-08-01T10:00:00Z", "client")] }),
    ];
    const m = computeMetricsForDay({ dateKey: DAY, asOf: endOfDay, bookings, users });
    expect(m.funnel).toEqual({ registeredClients: 3, clientsWithRequest: 2, clientsWithCompleted: 1 });
  });
});
