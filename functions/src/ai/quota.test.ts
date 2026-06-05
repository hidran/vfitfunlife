import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable fixture for the transaction's get() result. Hoisted so it is
// available inside the hoisted vi.mock factory (matching the convention in
// tools/searchProviders.test.ts).
const fx = vi.hoisted(() => ({
  snap: { exists: false, data: () => ({}) as Record<string, unknown> },
  setSpy: vi.fn(),
}));

vi.mock("firebase-admin", () => {
  const fakeTx = {
    get: async () => fx.snap,
    set: (...args: unknown[]) => fx.setSpy(...args),
  };
  const firestore = () => ({
    doc: () => ({ id: "ref" }),
    runTransaction: async (cb: (tx: typeof fakeTx) => Promise<void>) => cb(fakeTx),
  });
  // FieldValue is referenced inside reserveQuota's tx.set payload.
  (firestore as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => "SERVER_TS",
  };
  return { firestore };
});

import { usageDocPath, nextCountOrThrow, reserveQuota, releaseQuota } from "./quota";

describe("usageDocPath", () => {
  it("builds a per-user per-day path", () => {
    expect(usageDocPath("u1", new Date("2026-06-04T10:00:00Z"))).toBe("users/u1/ai_usage/2026-06-04");
  });

  it("supports a custom usage bucket", () => {
    expect(usageDocPath("u1", new Date("2026-06-05T10:00:00Z"), "ai_authoring_usage"))
      .toBe("users/u1/ai_authoring_usage/2026-06-05");
  });
});

describe("nextCountOrThrow", () => {
  it("increments under quota", () => {
    expect(nextCountOrThrow(0, 30)).toBe(1);
    expect(nextCountOrThrow(29, 30)).toBe(30);
  });
  it("throws at quota", () => {
    expect(() => nextCountOrThrow(30, 30)).toThrow(/quota/i);
  });
});

describe("reserveQuota (transaction)", () => {
  const now = new Date("2026-06-04T10:00:00Z");

  beforeEach(() => {
    fx.setSpy.mockReset();
    fx.snap = { exists: false, data: () => ({}) };
  });

  it("increments and writes the next count when under quota", async () => {
    fx.snap = { exists: true, data: () => ({ count: 5 }) };
    await expect(reserveQuota("u1", 30, now)).resolves.toBeUndefined();
    expect(fx.setSpy).toHaveBeenCalledTimes(1);
    const payload = fx.setSpy.mock.calls[0][1] as { count: number };
    expect(payload.count).toBe(6);
  });

  it("treats a non-number stored count as 0 and increments to 1", async () => {
    fx.snap = { exists: true, data: () => ({ count: "oops" }) };
    await expect(reserveQuota("u1", 30, now)).resolves.toBeUndefined();
    const payload = fx.setSpy.mock.calls[0][1] as { count: number };
    expect(payload.count).toBe(1);
  });

  it("rejects with quota-exceeded and does NOT write when at quota", async () => {
    fx.snap = { exists: true, data: () => ({ count: 30 }) };
    await expect(reserveQuota("u1", 30, now)).rejects.toMatchObject({ code: "quota-exceeded" });
    expect(fx.setSpy).not.toHaveBeenCalled();
  });
});

describe("releaseQuota (transaction)", () => {
  const now = new Date("2026-06-04T10:00:00Z");

  beforeEach(() => {
    fx.setSpy.mockReset();
    fx.snap = { exists: false, data: () => ({}) };
  });

  it("decrements the stored count by one", async () => {
    fx.snap = { exists: true, data: () => ({ count: 3 }) };
    await expect(releaseQuota("u1", now)).resolves.toBeUndefined();
    expect(fx.setSpy).toHaveBeenCalledTimes(1);
    const payload = fx.setSpy.mock.calls[0][1] as { count: number };
    expect(payload.count).toBe(2);
  });

  it("floors at 0 and never goes negative", async () => {
    fx.snap = { exists: true, data: () => ({ count: 0 }) };
    await expect(releaseQuota("u1", now)).resolves.toBeUndefined();
    const payload = fx.setSpy.mock.calls[0][1] as { count: number };
    expect(payload.count).toBe(0);
  });
});
