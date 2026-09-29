import { describe, it, expect, vi } from "vitest";
import {
  computeRosterStats,
  pickRosterDoc,
  planRosterSync,
  rosterClientId,
  rosterPairsForWrite,
  type RosterBooking,
  type RosterSyncDeps,
  type TimestampLike,
} from "./clientRosterCore";

const ts = (ms: number): TimestampLike => ({ toMillis: () => ms });
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);

const PAIR = { instructorId: "trainer1", userId: "cust1" };

function booking(overrides: Partial<RosterBooking> & { day?: number } = {}): RosterBooking {
  const { day = 0, ...rest } = overrides;
  return {
    status: "requested",
    finalPrice: 50,
    scheduledAt: ts(T0 + day * DAY),
    createdAt: ts(T0 + day * DAY - DAY),
    userName: "Mario Rossi",
    userEmail: "mario@example.com",
    userPhone: "+39 333 1",
    ...rest,
  };
}

function deps(overrides: Partial<RosterSyncDeps> = {}): RosterSyncDeps {
  return {
    findClientDocs: vi.fn(async () => []),
    getBookings: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => null),
    ...overrides,
  };
}

describe("rosterClientId", () => {
  it("is the deterministic instructorId_userId", () => {
    expect(rosterClientId("a", "b")).toBe("a_b");
  });
});

describe("computeRosterStats", () => {
  it("counts every booking, sums only payment_confirmed finalPrice, and dates visits from delivered sessions", () => {
    const stats = computeRosterStats([
      booking({ day: -30, status: "completed", finalPrice: 40 }),
      booking({ day: -14, status: "payment_confirmed", finalPrice: 45.5 }),
      booking({ day: -10, status: "payment_confirmed", finalPrice: 19.99 }),
      booking({ day: -7, status: "cancelled_by_client" }),
      booking({ day: 3, status: "accepted" }),
      booking({ day: 10, status: "requested" }),
    ]);
    expect(stats.totalBookings).toBe(6);
    expect(stats.totalSpent).toBe(65.49);
    expect(stats.firstVisit?.toMillis()).toBe(T0 - 30 * DAY);
    expect(stats.lastVisit?.toMillis()).toBe(T0 - 10 * DAY);
  });

  it("leaves first/last visit null until a session has taken place", () => {
    const stats = computeRosterStats([booking({ status: "requested" }), booking({ status: "accepted" })]);
    expect(stats.firstVisit).toBeNull();
    expect(stats.lastVisit).toBeNull();
    expect(stats.totalSpent).toBe(0);
  });

  it("ignores non-numeric prices", () => {
    const stats = computeRosterStats([booking({ status: "payment_confirmed", finalPrice: "50" })]);
    expect(stats.totalSpent).toBe(0);
  });

  it("takes contact details from the most recently created booking that has them", () => {
    const stats = computeRosterStats([
      booking({ day: -20, userName: "Old Name", userPhone: "+39 old" }),
      booking({ day: -1, userName: "New Name", userPhone: null }),
    ]);
    expect(stats.name).toBe("New Name");
    expect(stats.phone).toBe("+39 old");
  });

  it("is order-independent", () => {
    const list = [
      booking({ day: -5, status: "completed" }),
      booking({ day: -9, status: "payment_confirmed", finalPrice: 30 }),
      booking({ day: 2 }),
    ];
    const a = computeRosterStats(list);
    const b = computeRosterStats([...list].reverse());
    expect(a.totalSpent).toBe(b.totalSpent);
    expect(a.firstVisit?.toMillis()).toBe(b.firstVisit?.toMillis());
    expect(a.lastVisit?.toMillis()).toBe(b.lastVisit?.toMillis());
  });
});

describe("rosterPairsForWrite", () => {
  const base = { instructorId: "t1", userId: "u1", status: "requested", finalPrice: 50, scheduledAt: ts(T0) };

  it("returns the pair on create and on delete", () => {
    expect(rosterPairsForWrite(undefined, base)).toEqual([{ instructorId: "t1", userId: "u1" }]);
    expect(rosterPairsForWrite(base, undefined)).toEqual([{ instructorId: "t1", userId: "u1" }]);
  });

  it("returns the pair when a roster field changes", () => {
    expect(rosterPairsForWrite(base, { ...base, status: "accepted" })).toHaveLength(1);
    expect(rosterPairsForWrite(base, { ...base, scheduledAt: ts(T0 + DAY) })).toHaveLength(1);
  });

  it("skips writes that touch no roster field (Timestamps compared by value)", () => {
    expect(
      rosterPairsForWrite(base, { ...base, scheduledAt: ts(T0), updatedAt: ts(T0 + 5), userNotes: "hi" }),
    ).toEqual([]);
  });

  it("returns both pairs when a booking is reassigned", () => {
    expect(rosterPairsForWrite(base, { ...base, instructorId: "t2" })).toEqual([
      { instructorId: "t1", userId: "u1" },
      { instructorId: "t2", userId: "u1" },
    ]);
  });

  it("ignores venue bookings (no instructorId)", () => {
    expect(rosterPairsForWrite(undefined, { ...base, instructorId: null })).toEqual([]);
  });
});

describe("pickRosterDoc", () => {
  it("prefers the canonical id, else the lowest matching id, and ignores other pairs", () => {
    const docs = [
      { id: "z-manual", data: { providerId: "trainer1", userId: "cust1" } },
      { id: "demo-client-customer", data: { providerId: "trainer1", userId: "cust1" } },
      { id: "other", data: { providerId: "trainer1", userId: "cust2" } },
    ];
    expect(pickRosterDoc(docs, PAIR)?.id).toBe("demo-client-customer");
    expect(pickRosterDoc([...docs, { id: "trainer1_cust1", data: { ...PAIR, providerId: "trainer1" } }], PAIR)?.id)
      .toBe("trainer1_cust1");
    expect(pickRosterDoc([docs[2]], PAIR)).toBeNull();
  });
});

describe("planRosterSync", () => {
  it("creates trainerId_userId with empty trainer-owned fields on the first booking", async () => {
    const plan = await planRosterSync(deps({ getBookings: vi.fn(async () => [booking()]) }), PAIR);
    expect(plan).toMatchObject({
      kind: "create",
      id: "trainer1_cust1",
      data: {
        providerId: "trainer1",
        userId: "cust1",
        name: "Mario Rossi",
        email: "mario@example.com",
        phone: "+39 333 1",
        totalBookings: 1,
        totalSpent: 0,
        firstVisit: null,
        lastVisit: null,
        tags: [],
        notes: "",
        photoUrl: "",
      },
    });
  });

  it("writes nothing for a pair with no bookings and no doc", async () => {
    expect(await planRosterSync(deps(), PAIR)).toBeNull();
  });

  it("updates an existing (e.g. seeded) doc in place, touching only changed derived fields", async () => {
    const existing = {
      id: "demo-client-customer",
      data: {
        providerId: "trainer1", userId: "cust1", name: "Mario Rossi", email: "mario@example.com",
        phone: "+39 333 1", totalBookings: 1, totalSpent: 0, firstVisit: null, lastVisit: null,
        tags: ["forza"], notes: "ginocchio",
      },
    };
    const plan = await planRosterSync(
      deps({
        findClientDocs: vi.fn(async () => [existing]),
        getBookings: vi.fn(async () => [booking({ day: -2, status: "payment_confirmed", finalPrice: 60 })]),
      }),
      PAIR,
    );
    expect(plan?.kind).toBe("update");
    expect(plan?.id).toBe("demo-client-customer");
    expect(Object.keys(plan?.data ?? {}).sort()).toEqual(["firstVisit", "lastVisit", "totalSpent"]);
    expect(plan?.data.totalSpent).toBe(60);
    expect(plan?.data).not.toHaveProperty("tags");
    expect(plan?.data).not.toHaveProperty("notes");
  });

  it("is idempotent: applying the plan and re-planning yields no write", async () => {
    const bookings = [
      booking({ day: -3, status: "completed" }),
      booking({ day: -1, status: "payment_confirmed", finalPrice: 55 }),
    ];
    const first = await planRosterSync(deps({ getBookings: vi.fn(async () => bookings) }), PAIR);
    expect(first?.kind).toBe("create");
    const second = await planRosterSync(
      deps({
        findClientDocs: vi.fn(async () => [{ id: first!.id, data: { ...first!.data } }]),
        getBookings: vi.fn(async () => bookings),
      }),
      PAIR,
    );
    expect(second).toBeNull();
  });

  it("keeps the doc but zeroes totals when the pair's bookings are gone", async () => {
    const plan = await planRosterSync(
      deps({
        findClientDocs: vi.fn(async () => [{
          id: "trainer1_cust1",
          data: { providerId: "trainer1", userId: "cust1", name: "Mario", email: "m@x", phone: "",
            totalBookings: 2, totalSpent: 50, firstVisit: ts(T0), lastVisit: ts(T0) },
        }]),
      }),
      PAIR,
    );
    expect(plan).toEqual({
      kind: "update",
      id: "trainer1_cust1",
      data: { totalBookings: 0, totalSpent: 0, firstVisit: null, lastVisit: null },
    });
  });

  it("falls back to the user profile when no booking carries a name, and reads it only then", async () => {
    const getUserProfile = vi.fn(async () => ({ fullName: "Profile Name", email: "p@x.it", phone: "+39 9" }));
    const plan = await planRosterSync(
      deps({
        getBookings: vi.fn(async () => [booking({ userName: null, userEmail: null, userPhone: null })]),
        getUserProfile,
      }),
      PAIR,
    );
    expect(plan?.data).toMatchObject({ name: "Profile Name", email: "p@x.it", phone: "+39 9" });

    const getUserProfile2 = vi.fn(async () => null);
    await planRosterSync(deps({ getBookings: vi.fn(async () => [booking()]), getUserProfile: getUserProfile2 }), PAIR);
    expect(getUserProfile2).not.toHaveBeenCalled();
  });

  it("never blanks contact details an existing doc already has", async () => {
    const plan = await planRosterSync(
      deps({
        findClientDocs: vi.fn(async () => [{
          id: "trainer1_cust1",
          data: { providerId: "trainer1", userId: "cust1", name: "Mario", email: "m@x", phone: "+39 1",
            totalBookings: 0, totalSpent: 0, firstVisit: null, lastVisit: null },
        }]),
        getBookings: vi.fn(async () => [booking({ userName: "Mario", userEmail: null, userPhone: null })]),
      }),
      PAIR,
    );
    expect(plan?.data).toEqual({ totalBookings: 1 });
  });
});
