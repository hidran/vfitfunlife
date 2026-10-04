import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * commitProviderDecision over an in-memory Firestore, pinning the D2 race fix: on the
 * self-apply path it re-checks "already a business" against its OWN reads and guards its
 * users/{uid} write with the read's updateTime, so an individual auto-approval racing a
 * business application fails instead of verifying the company unreviewed.
 */

type Ref = { path: string };
type Op = [op: "set" | "update", path: string, data: unknown, extra?: unknown];

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const ops: Op[] = [];
  const state = { commitError: null as unknown };

  const snap = (path: string) => {
    const data = docs.get(path);
    return {
      exists: data !== undefined,
      data: () => data,
      updateTime: data ? { readAt: path } : undefined,
    };
  };
  let autoId = 0;
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => snap(path),
    collection: (sub: string) => ({
      limit: () => ({ get: async () => ({ empty: true }) }),
      doc: (id: string) => ref(`${path}/${sub}/${id}`),
    }),
  });
  const db = {
    collection: (name: string) => ({ doc: (id?: string) => ref(`${name}/${id ?? `auto-${++autoId}`}`) }),
    batch: () => ({
      set: (r: Ref, data: unknown, options?: unknown) => {
        ops.push(["set", r.path, data, options]);
      },
      update: (r: Ref, data: unknown, precondition?: unknown) => {
        ops.push(["update", r.path, data, precondition]);
      },
      commit: async () => {
        if (state.commitError) throw state.commitError;
      },
    }),
  };
  return { docs, ops, state, db };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.db,
  FieldValue: { serverTimestamp: () => "NOW" },
}));
// utils/roles opens admin.firestore() at module load; only its permission table is used here.
vi.mock("../utils/roles", () => ({
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { commitProviderDecision } from "./commitDecision";

const ACTOR = { uid: "u1", email: "mario@example.it", role: "customer" };
const SELF_APPLY = { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" };
const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "12345678903",
  displayName: "Karate Club Milano",
};

describe("commitProviderDecision (handler)", () => {
  beforeEach(() => {
    h.docs.clear();
    h.ops.length = 0;
    h.state.commitError = null;
    h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer" });
  });

  it("self-apply: refuses when its own reads show a business (the business won the race)", async () => {
    for (const setup of [
      () => h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business" }),
      () => h.docs.set("instructors/u1", { applicationStatus: "pending", business: COMPANY }),
    ]) {
      h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer" });
      h.docs.delete("instructors/u1");
      setup();
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ACTOR, application: SELF_APPLY }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "business_account_exists" });
      expect(h.ops).toEqual([]);
    }
  });

  it("self-apply: the users/{uid} write only lands if nothing touched the doc since it was read", async () => {
    await commitProviderDecision({ providerId: "u1", decision: "verified", actor: ACTOR, application: SELF_APPLY });
    const userWrite = h.ops.find(([op, path]) => op === "update" && path === "users/u1");
    expect(userWrite?.[3]).toEqual({ lastUpdateTime: { readAt: "users/u1" } });
  });

  it("self-apply: a stale write surfaces as a retryable concurrent_update, not an internal error", async () => {
    h.state.commitError = Object.assign(new Error("9 FAILED_PRECONDITION: stale"), { code: 9 });
    await expect(
      commitProviderDecision({ providerId: "u1", decision: "verified", actor: ACTOR, application: SELF_APPLY }),
    ).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
  });

  it("admin path: approving a business is allowed, keeps its name and leaves `business` alone", async () => {
    h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business" });
    h.docs.set("instructors/u1", {
      name: "Karate Club Milano",
      fullName: "Karate Club Milano",
      applicationStatus: "pending",
      business: COMPANY,
    });
    await commitProviderDecision({
      providerId: "u1",
      decision: "verified",
      actor: { uid: "admin-1", email: "admin@example.it", role: "admin" },
    });

    const userWrite = h.ops.find(([op, path]) => op === "update" && path === "users/u1");
    expect(userWrite?.[3]).toBeUndefined(); // no precondition outside the self-apply path
    const instructorWrite = h.ops.find(([op, path]) => op === "set" && path === "instructors/u1");
    expect(instructorWrite?.[2]).toMatchObject({ applicationStatus: "verified", providerProfile: { isVerified: true } });
    expect(instructorWrite?.[2]).not.toHaveProperty("name");
    expect(instructorWrite?.[2]).not.toHaveProperty("fullName");
    expect(instructorWrite?.[2]).not.toHaveProperty("business");
  });
});
