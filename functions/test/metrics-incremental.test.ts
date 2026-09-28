/**
 * P2-2 equivalence: the bounded nightly path (rollup + recent bookings + user queries) must
 * produce exactly what the full-scan path produces, night after night, as the rollup is
 * advanced. A random but seeded booking history is replayed: on each simulated night the
 * collections contain only what existed by then, `updatedAt` is the latest event, and the
 * "recent" set is what `where("updatedAt", ">=", settledBefore)` would return.
 */
import { describe, it, expect } from "vitest";
import { computeMetricsForDay, dateKeyInZone } from "../src/metrics/compute";
import {
  buildUserAggregates,
  computeMetricsForDayIncremental,
  emptyRollup,
  foldIntoRollup,
  rollupFromFirestore,
  rollupToFirestore,
  settleCutoffFor,
  type BookingsRollup,
} from "../src/metrics/incremental";
import { toMetricsUser } from "../src/metrics/mapping";
import { endOfLocalDayInZone as endOfLocalDay } from "../src/metrics/compute";
import type { MetricsBooking, MetricsDaily } from "../src/metrics/types";
import type { BookingStatus, StatusActorRole } from "../src/bookings/types";

const TZ = "Europe/Rome";
const DAY = 86400000;
const HOUR = 3600000;

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ev { at: number; status: BookingStatus; role: StatusActorRole }
interface GenBooking {
  id: string;
  userId: string | undefined;
  instructorId: string | null;
  instructorName: string | null;
  events: Ev[];
  lateCancellation: boolean;
  amount: number;
  response: { at: number; kind: "confirmed" | "disputed" } | null;
}
interface GenUser { id: string; data: Record<string, unknown>; createdAt: number }

function generate(seed: number, start: number, spanDays: number) {
  const r = prng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const id = () => Math.floor(r() * 36 ** 8).toString(36).padStart(8, "0");

  const trainers = ["t_a", "t_b", "t_c", "t_d", "provider_demo_1", "t_deleted"];
  const clients = Array.from({ length: 18 }, (_, i) => `c${i}`);

  const bookings: GenBooking[] = [];
  for (let i = 0; i < 220; i++) {
    const created = start + r() * spanDays * DAY;
    const venue = r() < 0.08;
    const instructorId = venue ? null : pick(trainers);
    const events: Ev[] = [{ at: created, status: "requested", role: "client" }];
    let t = created;
    let response: GenBooking["response"] = null;
    let late = false;
    const roll = r();
    if (roll < 0.1) {
      t += r() * 3 * DAY;
      events.push({ at: t, status: "declined", role: "trainer" });
    } else if (roll < 0.2) {
      t += r() * 2 * DAY;
      events.push({ at: t, status: "cancelled_by_client", role: "client" });
      late = r() < 0.5;
    } else {
      t += r() * 3 * DAY;
      events.push({ at: t, status: "accepted", role: "trainer" });
      const next = r();
      if (next < 0.12) {
        t += r() * 5 * DAY;
        events.push({ at: t, status: "cancelled_by_trainer", role: r() < 0.5 ? "trainer" : "admin" });
        late = r() < 0.5;
      } else if (next < 0.2) {
        t += r() * 5 * DAY;
        events.push({ at: t, status: "no_show", role: "trainer" });
      } else if (next < 0.95) {
        t += r() * 10 * DAY;
        events.push({ at: t, status: "completed", role: "trainer" });
        if (r() < 0.75) {
          t += r() * 6 * DAY;
          events.push({ at: t, status: "payment_confirmed", role: "trainer" });
          if (r() < 0.7) {
            response = { at: t + r() * 4 * DAY, kind: r() < 0.25 ? "disputed" : "confirmed" };
          }
        }
      }
    }
    bookings.push({
      id: id(),
      // One client without a uid, like a legacy document.
      userId: r() < 0.02 ? undefined : pick(clients),
      instructorId,
      // Names vary per booking so the "lowest id names the trainer" rule is exercised.
      instructorName: instructorId && r() < 0.9 ? `${instructorId}-${Math.floor(r() * 3)}` : null,
      events,
      lateCancellation: late,
      amount: Math.round((20 + r() * 80) * 100) / 100,
      response,
    });
  }

  const users: GenUser[] = [];
  const role = (i: number) => (i % 11 === 0 ? undefined : i % 13 === 0 ? null : "customer");
  clients.forEach((c, i) => users.push({
    id: c, createdAt: start + r() * spanDays * DAY,
    data: { role: role(i), ...(i === 3 ? { isDeleted: true } : {}), ...(i === 5 ? { deletedAt: "x" } : {}),
      ...(i === 7 ? { deletedAt: false } : {}), email: `${c}@example.com` },
  }));
  for (let i = 0; i < 6; i++) {
    users.push({ id: `customer_seed_${i}`, createdAt: start + r() * spanDays * DAY,
      data: { role: "customer", email: `x${i}@demo.vfit` } });
  }
  for (const t of trainers) {
    users.push({ id: t, createdAt: start + r() * spanDays * DAY,
      data: { role: "provider", ...(t === "t_deleted" ? { isDeleted: true } : {}) } });
  }
  users.push({ id: "admin1", createdAt: start, data: { role: "admin" } });
  users.push({ id: "c_extra_no_created", createdAt: NaN, data: { role: "customer" } });
  return { bookings, users };
}

/** The collections as they stood at `now`. */
function snapshotAt(gen: ReturnType<typeof generate>, now: number) {
  const bookings: Array<MetricsBooking & { updatedAt: number }> = [];
  for (const g of gen.bookings) {
    const visible = g.events.filter((e) => e.at <= now);
    if (!visible.length) continue;
    const paid = visible.some((e) => e.status === "payment_confirmed");
    const responded = paid && g.response && g.response.at <= now ? g.response : null;
    const cancelled = visible.some((e) => e.status.startsWith("cancelled_"));
    const times = [...visible.map((e) => e.at), ...(responded ? [responded.at] : [])];
    bookings.push({
      id: g.id,
      userId: g.userId as string,
      instructorId: g.instructorId,
      instructorName: g.instructorName,
      status: visible[visible.length - 1].status,
      statusHistory: visible.map((e) => ({
        status: e.status, actorUid: "x", actorRole: e.role, at: new Date(e.at),
      })),
      lateCancellation: cancelled && g.lateCancellation,
      paymentConfirmation: paid ? {
        amount: g.amount,
        clientResponse: responded ? responded.kind : null,
        clientRespondedAt: responded ? new Date(responded.at) : null,
      } : null,
      // serverTimestamp commits a little after the in-function Timestamp.now().
      updatedAt: Math.max(...times) + 37,
    });
  }
  bookings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rawUsers = gen.users
    .filter((u) => Number.isNaN(u.createdAt) || u.createdAt <= now)
    .map((u) => ({
      id: u.id,
      data: { ...u.data, ...(Number.isNaN(u.createdAt) ? {} : { createdAt: new Date(u.createdAt) }) },
    }));
  return { bookings, rawUsers };
}

function userAggregatesFor(
  rawUsers: Array<{ id: string; data: Record<string, unknown> }>,
  since: Date,
  recent: MetricsBooking[],
) {
  const all = rawUsers.map((u) => ({ raw: u, m: toMetricsUser(u.id, u.data) }));
  const trainerIds = new Set(recent.map((b) => b.instructorId).filter(Boolean));
  // Emulates the Firestore queries in loadUserAggregates.
  return buildUserAggregates({
    totalUsers: all.length,
    nonCustomerRoleUsers: all.filter(({ raw }) =>
      raw.data.role !== undefined && raw.data.role !== null && raw.data.role !== "customer").length,
    providerUsers: all.filter(({ raw }) => raw.data.role === "provider").length,
    recentTrainerUsers: all.filter(({ raw }) => trainerIds.has(raw.id)).map((x) => x.m),
    hiddenCandidates: all.filter(({ raw }) =>
      raw.data.isDeleted === true ||
      (raw.data.deletedAt !== undefined && raw.data.deletedAt !== null) ||
      raw.id.startsWith("customer_") || raw.id.startsWith("provider_")).map((x) => x.m),
    recentUsers: all.filter(({ m }) => m.createdAt && m.createdAt >= since).map((x) => x.m),
  });
}

function nightKeys(now: number): string[] {
  return Array.from({ length: 7 }, (_, i) => dateKeyInZone(new Date(now - (i + 1) * DAY), TZ));
}

function expectSame(actual: MetricsDaily, expected: MetricsDaily) {
  const { cumulativeGrossValue: ga, ...restA } = actual;
  const { cumulativeGrossValue: ge, ...restE } = expected;
  expect(restA).toEqual(restE);
  // Summed in a different order (rollup first), so allow float rounding only.
  expect(ga).toBeCloseTo(ge, 6);
  // Same insertion order too — it decides who survives truncation.
  expect(Object.keys(actual.byTrainer)).toEqual(Object.keys(expected.byTrainer));
}

describe("bounded nightly metrics == full scan", () => {
  for (const seed of [1, 7, 42]) {
    it(`matches night after night as the rollup advances (seed ${seed})`, () => {
      const start = Date.UTC(2026, 2, 1); // spans the end-of-March DST change
      const gen = generate(seed, start, 150);
      const r = prng(seed * 31);

      let rollup: BookingsRollup | null = null;
      let nights = 0;
      let rebuilds = 0;
      let maxRecent = 0;
      let nonTrivial = 0;

      for (let d = 5; d < 190; d++) {
        if (r() < 0.1) continue; // a missed run: the next one reads a larger recent set
        const now = start + d * DAY + 30 * 60 * 1000 + 2 * HOUR; // ~02:30 local
        const keys = nightKeys(now);
        const cutoff = settleCutoffFor(endOfLocalDay([...keys].sort()[0]));
        const { bookings: all, rawUsers } = snapshotAt(gen, now);

        let recent: MetricsBooking[];
        if (!rollup || rollup.settledBefore > cutoff) {
          rollup = foldIntoRollup(emptyRollup(), all, cutoff);
          recent = all;
          rebuilds++;
        } else {
          const since = rollup.settledBefore.getTime();
          recent = all.filter((b) => b.updatedAt >= since);
        }
        maxRecent = Math.max(maxRecent, recent.length);

        const oldestAsOf = endOfLocalDay([...keys].sort()[0]);
        const users = userAggregatesFor(rawUsers, new Date(oldestAsOf.getTime() - 2 * DAY), recent);
        const fullUsers = rawUsers.map((u) => toMetricsUser(u.id, u.data));
        const visibleTrainerIds = new Set(
          fullUsers.filter((u) => u.role === "provider" && !u.hidden).map((u) => u.uid));

        for (const dateKey of keys) {
          const asOf = endOfLocalDay(dateKey);
          const expected = computeMetricsForDay({
            dateKey, asOf, bookings: all, users: fullUsers, visibleTrainerIds, timeZone: TZ,
          });
          const actual = computeMetricsForDayIncremental({
            dateKey, asOf, rollup, recent, users, timeZone: TZ,
          });
          expectSame(actual, expected);
          if (expected.cumulativeCompleted > 0 && expected.sessionsRequested > 0) nonTrivial++;
        }

        foldIntoRollup(rollup, recent, cutoff);
        // Every night goes through the persisted shape, as in production.
        rollup = rollupFromFirestore(rollupToFirestore(rollup))!;
        nights++;
      }

      expect(nights).toBeGreaterThan(150);
      expect(rebuilds).toBe(1);
      expect(nonTrivial).toBeGreaterThan(100);
      // Bounded: the recent set is a fraction of the collection once history accumulates.
      expect(maxRecent).toBeLessThan(gen.bookings.length);
    });
  }

  it("refuses a rollup settled past the window it would have to cover", () => {
    const rollup = emptyRollup();
    rollup.settledBefore = new Date("2026-09-20T00:00:00Z");
    expect(() => computeMetricsForDayIncremental({
      dateKey: "2026-09-27", asOf: endOfLocalDay("2026-09-27"), rollup, recent: [],
      users: { totalTrainers: 0, visibleTrainerIds: new Set(), visibleCustomers: 0, recentVisibleCustomerCreatedAts: [] },
    })).toThrow(/too recent/);
  });
});
