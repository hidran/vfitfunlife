import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * commitProviderDecision over an in-memory Firestore, pinning:
 * - the D2 race fix: on the self-apply path it re-checks "already a business" against its OWN
 *   reads and guards its users/{uid} write with the read's updateTime, so an individual
 *   auto-approval racing a business application fails instead of verifying the company
 *   unreviewed;
 * - B8 "approve what the admin actually saw": approving a business needs the reviewed tax id and
 *   legal name, checked against the same read the write is guarded on.
 *
 * The fake batch only records its writes in `h.ops` when it commits, and fails the commit with
 * gRPC code 9 when a `lastUpdateTime` precondition names a version older than the stored one —
 * `h.state.beforeCommit` lets a test change a doc between the reads and the commit.
 */

type Ref = { path: string };
type Op = [op: "set" | "update", path: string, data: unknown, extra?: unknown];
type Precondition = { lastUpdateTime?: { readAt: string; version: number } };

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const ops: Op[] = [];
  const state = {
    commitError: null as unknown,
    beforeCommit: null as null | (() => void),
    batchCommits: 0,
  };

  const put = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const snap = (path: string) => {
    const data = docs.get(path);
    return {
      exists: data !== undefined,
      data: () => data,
      updateTime: data ? { readAt: path, version: versions.get(path) ?? 0 } : undefined,
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
    batch: () => {
      const writes: Op[] = [];
      return {
        set: (r: Ref, data: unknown, options?: unknown) => {
          writes.push(["set", r.path, data, options]);
        },
        update: (r: Ref, data: unknown, precondition?: Precondition) => {
          writes.push(["update", r.path, data, precondition]);
        },
        commit: async () => {
          state.batchCommits++;
          const hook = state.beforeCommit;
          state.beforeCommit = null;
          hook?.();
          if (state.commitError) throw state.commitError;
          for (const [op, path, , extra] of writes) {
            const pre = op === "update" ? (extra as Precondition | undefined) : undefined;
            if (pre?.lastUpdateTime && pre.lastUpdateTime.version !== (versions.get(path) ?? 0)) {
              throw Object.assign(new Error("9 FAILED_PRECONDITION: the stored version does not match"), { code: 9 });
            }
          }
          ops.push(...writes);
        },
      };
    },
  };
  return { docs, versions, ops, state, put, db };
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
const ADMIN = { uid: "admin-1", email: "admin@example.it", role: "admin" };
const SELF_APPLY = { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" };
const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "12345678903",
  displayName: "Karate Club Milano",
};
const REVIEWED = { vatNumber: COMPANY.vatNumber, legalName: COMPANY.legalName };
const OTHER_VAT = "00743110157";

const PENDING_COMPANY = {
  name: "Karate Club Milano",
  fullName: "Karate Club Milano",
  applicationStatus: "pending",
  providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
  business: COMPANY,
};

const writesTo = (path: string) => h.ops.filter(([, p]) => p === path);

describe("commitProviderDecision (handler)", () => {
  beforeEach(() => {
    h.docs.clear();
    h.versions.clear();
    h.ops.length = 0;
    h.state.commitError = null;
    h.state.beforeCommit = null;
    h.state.batchCommits = 0;
    h.put("users/u1", { fullName: "Mario Rossi", role: "customer" });
  });

  it("self-apply: refuses when its own reads show a business (the business won the race)", async () => {
    for (const setup of [
      () => h.put("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business" }),
      () => h.put("instructors/u1", { applicationStatus: "pending", business: COMPANY }),
    ]) {
      h.put("users/u1", { fullName: "Mario Rossi", role: "customer" });
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
    expect(userWrite?.[3]).toEqual({ lastUpdateTime: { readAt: "users/u1", version: 1 } });
  });

  it("self-apply: a stale write surfaces as a retryable concurrent_update, not an internal error", async () => {
    h.state.commitError = Object.assign(new Error("9 FAILED_PRECONDITION: stale"), { code: 9 });
    await expect(
      commitProviderDecision({ providerId: "u1", decision: "verified", actor: ACTOR, application: SELF_APPLY }),
    ).rejects.toMatchObject({ code: "aborted", message: "concurrent_update" });
  });

  it("admin path: approving a business is allowed, keeps its name and leaves `business` alone", async () => {
    h.put("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business" });
    h.put("instructors/u1", PENDING_COMPANY);
    await commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview: REVIEWED });

    const userWrite = h.ops.find(([op, path]) => op === "update" && path === "users/u1");
    expect(userWrite?.[3]).toBeUndefined(); // no precondition on users outside the self-apply path
    const instructorWrite = h.ops.find(([op, path]) => op === "set" && path === "instructors/u1");
    expect(instructorWrite?.[2]).toMatchObject({ applicationStatus: "verified", providerProfile: { isVerified: true } });
    expect(instructorWrite?.[2]).not.toHaveProperty("name");
    expect(instructorWrite?.[2]).not.toHaveProperty("fullName");
    expect(instructorWrite?.[2]).not.toHaveProperty("business");
  });

  describe("B8: approve what the admin actually saw", () => {
    beforeEach(() => {
      h.put("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business", providerStatus: "pending" });
      h.put("instructors/u1", PENDING_COMPANY);
    });

    it("a matching review proceeds, and the instructors write is guarded on the very read the check used", async () => {
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview: REVIEWED }),
      ).resolves.toEqual({ draftServicesSeeded: 0 });
      // The guard (an update carrying the read's updateTime) comes first, then the real patch;
      // one atomic commit, so the patch lands only if the doc is still the one that was checked.
      expect(writesTo("instructors/u1")).toEqual([
        ["update", "instructors/u1", { updatedAt: "NOW" }, { lastUpdateTime: { readAt: "instructors/u1", version: 1 } }],
        ["set", "instructors/u1", expect.objectContaining({ applicationStatus: "verified" }), { merge: true }],
      ]);
      expect(writesTo("users/u1")).toEqual([
        ["update", "users/u1", expect.objectContaining({ providerStatus: "verified" }), undefined],
      ]);
    });

    it("a swapped tax id or legal name is refused with stale_review and nothing is written", async () => {
      for (const expectedReview of [
        { ...REVIEWED, vatNumber: OTHER_VAT },
        { ...REVIEWED, legalName: "Karate Club Roma S.r.l." },
      ]) {
        await expect(
          commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview }),
        ).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      }
      expect(h.state.batchCommits).toBe(0);
      expect(h.ops).toEqual([]);
    });

    it("the company swapped its tax id after the admin loaded it: the review no longer matches", async () => {
      // The admin's screen showed COMPANY; a re-application has since moved it to OTHER_VAT.
      h.put("instructors/u1", { ...PENDING_COMPANY, business: { ...COMPANY, vatNumber: OTHER_VAT } });
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview: REVIEWED }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      expect(h.ops).toEqual([]);
    });

    it("a change landing between the check's read and the commit fails the guard ⇒ stale_review, nothing written", async () => {
      h.state.beforeCommit = () => {
        h.put("instructors/u1", { ...PENDING_COMPANY, business: { ...COMPANY, vatNumber: OTHER_VAT } });
      };
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN, expectedReview: REVIEWED }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "stale_review" });
      expect(h.state.batchCommits).toBe(1);
      expect(h.ops).toEqual([]);
    });

    it("approving a business without a review is refused with review_required", async () => {
      await expect(
        commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN }),
      ).rejects.toMatchObject({ code: "failed-precondition", message: "review_required" });
      expect(h.ops).toEqual([]);
    });

    it("rejecting a business needs no review, and its write is not guarded", async () => {
      await commitProviderDecision({ providerId: "u1", decision: "rejected", actor: ADMIN, notes: "P.IVA cessata" });
      expect(writesTo("instructors/u1")).toEqual([
        ["set", "instructors/u1", expect.objectContaining({ applicationStatus: "rejected" }), { merge: true }],
      ]);
    });
  });

  it("an individual's approval is unchanged: no review needed, no guard, and a concurrent edit does not fail it", async () => {
    h.put("instructors/u1", { name: "Mario Rossi", applicationStatus: "pending", providerProfile: { isVerified: false } });
    h.state.beforeCommit = () => {
      h.put("instructors/u1", { name: "Mario Rossi", applicationStatus: "pending", providerProfile: { isVerified: false, bio: "x" } });
    };
    await commitProviderDecision({ providerId: "u1", decision: "verified", actor: ADMIN });
    expect(writesTo("instructors/u1")).toEqual([
      ["set", "instructors/u1", expect.objectContaining({ applicationStatus: "verified" }), { merge: true }],
    ]);
  });
});
