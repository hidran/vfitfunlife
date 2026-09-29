/**
 * D5: demo accounts and demo bookings never count in a stat or metric.
 */
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  bookingInvolvesDemo,
  isDemoAccount,
  isDemoBooking,
  isDemoEmail,
  ratingsForSummary,
} from "../src/lib/demo";
import { computeMetricsForDay } from "../src/metrics/compute";
import {
  buildUserAggregates,
  computeMetricsForDayIncremental,
  emptyRollup,
  foldIntoRollup,
} from "../src/metrics/incremental";
import { isHidden, toMetricsBooking, toMetricsUser } from "../src/metrics/mapping";
import { computeRatingSummary } from "../src/users/reviewRules";
import type { MetricsBooking } from "../src/metrics/types";
import type { BookingStatus } from "../src/bookings/types";

describe("demo detection", () => {
  it("recognises the demo email domain, case- and whitespace-insensitively", () => {
    expect(isDemoEmail("demo.customer@vitfitdemo.dev")).toBe(true);
    expect(isDemoEmail(" Luca.Verdi@VitFitDemo.dev ")).toBe(true);
    expect(isDemoEmail("someone@gmail.com")).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });

  it("flags accounts by isDemo, email or demo-* id — never a real uid", () => {
    expect(isDemoAccount("7MK6TgATIbhl3BkUksLNdGi7cMg1", { isDemo: true })).toBe(true);
    // demo.provider on an adopted (real-looking) uid, found by email alone.
    expect(isDemoAccount("Xy12AbCdEfGhIjKlMnOpQrStUv34", { email: "demo.provider@vitfitdemo.dev" })).toBe(true);
    expect(isDemoAccount("demo-customer-vfit", {})).toBe(true);
    expect(isDemoAccount("demo-trainer-yoga-01", undefined)).toBe(true);
    // A roster entry for a synthetic demo client.
    expect(isDemoAccount("tr1_demo-client-user-luca", { userId: "demo-client-user-luca" })).toBe(true);
    expect(isDemoAccount("Xy12AbCdEfGhIjKlMnOpQrStUv34", { email: "mario@rossi.it", isDemo: false })).toBe(false);
  });

  it("flags bookings made by or with a demo account", () => {
    expect(isDemoBooking("demo-booking-demo-client-luca-1", {})).toBe(true);
    expect(isDemoBooking("b1", { isDemo: true })).toBe(true);
    expect(isDemoBooking("b1", { userEmail: "demo.customer@vitfitdemo.dev", userId: "u1" })).toBe(true);
    expect(isDemoBooking("b1", { userId: "demo-customer-vfit" })).toBe(true);
    expect(isDemoBooking("b1", { userId: "u1", instructorId: "demo-trainer-hiit-01" })).toBe(true);
    expect(isDemoBooking("b1", { userId: "u1", instructorId: "t1", userEmail: "a@b.it" })).toBe(false);
  });

  it("createBooking: a booking inherits isDemo from its customer OR its trainer", () => {
    const real = { email: "mario@rossi.it" };
    expect(bookingInvolvesDemo("u1", real, "t1", { fullName: "Real" })).toBe(false);
    expect(bookingInvolvesDemo("u1", { ...real, isDemo: true }, "t1", {})).toBe(true);
    expect(bookingInvolvesDemo("u1", real, "t1", { isDemo: true })).toBe(true);
    expect(bookingInvolvesDemo("u1", real, "demo-provider-vfit", null)).toBe(true);
    // Venue booking: no trainer at all.
    expect(bookingInvolvesDemo("u1", real, null, null)).toBe(false);
  });
});

describe("public ratings", () => {
  const reviews = [{ rating: 5 }, { rating: 3 }, { rating: 1, isDemo: true }];

  it("a demo customer's review never moves a real trainer's or venue's rating", () => {
    expect(computeRatingSummary(ratingsForSummary(reviews, false))).toEqual({ ratingAvg: 4, reviewCount: 2 });
  });

  it("a demo trainer's own rating counts every review", () => {
    expect(computeRatingSummary(ratingsForSummary(reviews, true))).toEqual({ ratingAvg: 3, reviewCount: 3 });
  });
});

// --- metrics ---------------------------------------------------------------------------------

const DAY = "2026-08-09";
const asOf = new Date("2026-08-09T21:59:59Z");
const at = (iso: string) => new Date(iso);

function metricsBooking(id: string, over: Partial<MetricsBooking> = {}): MetricsBooking {
  const history = (["requested", "accepted", "completed", "payment_confirmed"] as BookingStatus[])
    .map((status, i) => ({
      status, actorUid: "x", actorRole: "trainer" as const,
      at: at(`2026-08-09T${String(8 + i).padStart(2, "0")}:00:00Z`),
    }));
  return {
    id,
    userId: "client1",
    instructorId: "trainer1",
    instructorName: "Marco",
    status: "payment_confirmed",
    statusHistory: history,
    paymentConfirmation: { amount: 50, clientResponse: "confirmed", clientRespondedAt: at("2026-08-09T12:00:00Z") },
    ...over,
  };
}

describe("metrics_daily", () => {
  const real = metricsBooking("b-real");
  const demoByCustomer = metricsBooking("b-demo-1", { userId: "demo-customer-vfit", isDemo: true });
  const demoWithTrainer = metricsBooking("b-demo-2", { instructorId: "demo-provider-vfit", isDemo: true });

  it("maps a demo booking document to isDemo", () => {
    const doc = { userId: "demo-customer-vfit", instructorId: "t1", status: "requested", statusHistory: [] };
    expect(toMetricsBooking("x", doc).isDemo).toBe(true);
    expect(toMetricsBooking("x", { ...doc, userId: "u1" }).isDemo).toBe(false);
  });

  it("hides demo accounts from trainer and client counts", () => {
    expect(isHidden("demo-provider-vfit", { role: "provider" })).toBe(true);
    expect(isHidden("u1", { role: "customer", isDemo: true })).toBe(true);
    expect(isHidden("u1", { role: "customer", email: "demo.customer@vitfitdemo.dev" })).toBe(true);
    expect(isHidden("u1", { role: "customer", email: "mario@rossi.it" })).toBe(false);

    const users = [
      toMetricsUser("p1", { role: "provider" }),
      toMetricsUser("p2", { role: "provider", isDemo: true }),
      toMetricsUser("c1", { role: "customer", createdAt: Timestamp.fromDate(at("2026-08-09T10:00:00Z")) }),
      toMetricsUser("c2", { role: "customer", isDemo: true, createdAt: Timestamp.fromDate(at("2026-08-09T10:00:00Z")) }),
    ];
    const m = computeMetricsForDay({ dateKey: DAY, asOf, bookings: [], users, visibleTrainerIds: new Set(["p1"]) });
    expect(m.totalTrainers).toBe(1);
    expect(m.newClients).toBe(1);
    expect(m.funnel.registeredClients).toBe(1);
  });

  it("full scan: demo bookings contribute to no daily, cumulative or per-trainer figure", () => {
    const m = computeMetricsForDay({
      dateKey: DAY, asOf, bookings: [real, demoByCustomer, demoWithTrainer], users: [],
      visibleTrainerIds: new Set(["trainer1", "demo-provider-vfit"]),
    });
    expect(m.sessionsRequested).toBe(1);
    expect(m.sessionsCompleted).toBe(1);
    expect(m.grossValue).toBe(50);
    expect(m.cumulativeGrossValue).toBe(50);
    expect(m.activeTrainers).toBe(1);
    expect(Object.keys(m.byTrainer)).toEqual(["trainer1"]);
    expect(m.funnel.clientsWithRequest).toBe(1);
  });

  it("bounded path: neither the rollup nor the recent set counts a demo booking", () => {
    // Settle everything before the day into the rollup, demo bookings included in the input.
    const old = (b: MetricsBooking, id: string): MetricsBooking => ({
      ...b, id,
      statusHistory: b.statusHistory.map((h) => ({ ...h, at: new Date(h.at.getTime() - 60 * 86400000) })),
    });
    const rollup = foldIntoRollup(
      emptyRollup(),
      [old(real, "o-real"), old(demoByCustomer, "o-demo-1"), old(demoWithTrainer, "o-demo-2")],
      new Date(asOf.getTime() - 31 * 86400000),
    );
    expect(rollup.cumulativeCompleted).toBe(1);
    expect(rollup.cumulativeGrossValue).toBe(50);
    expect([...rollup.trainers.keys()]).toEqual(["trainer1"]);

    const users = buildUserAggregates({
      totalUsers: 0, nonCustomerRoleUsers: 0, providerUsers: 0,
      recentTrainerUsers: [], hiddenCandidates: [], recentUsers: [],
    });
    const m = computeMetricsForDayIncremental({
      dateKey: DAY, asOf, rollup, recent: [real, demoByCustomer, demoWithTrainer], users,
    });
    expect(m.sessionsCompleted).toBe(1);
    expect(m.cumulativeCompleted).toBe(2);
    expect(m.cumulativeGrossValue).toBe(100);
    expect(Object.keys(m.byTrainer)).toEqual(["trainer1"]);
  });

  it("buildUserAggregates subtracts demo providers and customers found by the isDemo query", () => {
    const demoP = toMetricsUser("Xy12AbCdEfGhIjKlMnOpQrStUv34", { role: "provider", isDemo: true });
    const demoC = toMetricsUser("demo-customer-vfit", { role: "customer" });
    const agg = buildUserAggregates({
      totalUsers: 10, nonCustomerRoleUsers: 3, providerUsers: 3,
      recentTrainerUsers: [demoP, toMetricsUser("t1", { role: "provider" })],
      // The same demo account can come back from two queries (isDemo and the id prefix).
      hiddenCandidates: [demoP, demoC, demoC],
      recentUsers: [],
    });
    expect(agg.totalTrainers).toBe(2);
    expect(agg.visibleCustomers).toBe(6);
    expect([...agg.visibleTrainerIds]).toEqual(["t1"]);
  });
});
