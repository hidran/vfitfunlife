import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Handler-level wiring of applyAsProvider over an in-memory Firestore. The decisions
 * themselves are unit-tested beside their pure modules; this pins how the callable strings
 * them together — above all that a business never reaches commitProviderDecision (D2).
 */

type Ref = { path: string };
type Op = [op: "create" | "delete" | "set" | "update", path: string, data?: unknown];

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const ops: Op[] = [];
  const settings = { autoApprove: true };
  const commitProviderDecision = vi.fn();

  const snap = (path: string) => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  };
  const ref = (path: string) => ({ path, get: async () => snap(path) });
  const record = (op: Op[0]) => (r: Ref, data?: unknown) => {
    ops.push([op, r.path, data]);
  };
  const tx = {
    get: async (r: Ref) => snap(r.path),
    create: record("create"),
    delete: (r: Ref) => {
      ops.push(["delete", r.path]);
    },
    set: record("set"),
    update: record("update"),
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    batch: () => ({ set: record("set"), update: record("update"), commit: async () => undefined }),
  };
  return { docs, ops, settings, commitProviderDecision, db };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.db,
  FieldValue: { serverTimestamp: () => "NOW" },
}));
vi.mock("../lib/cachedDoc", () => ({ cachedDocRead: async () => h.settings }));
vi.mock("./commitDecision", () => ({ commitProviderDecision: h.commitProviderDecision }));

import { applyAsProvider } from "./applyAsProvider";

function call(data: Record<string, unknown>) {
  return (applyAsProvider as unknown as { run: (r: unknown) => Promise<unknown> }).run({
    auth: { uid: "u1", token: { email: "mario@example.it" } },
    data,
  });
}

const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "IT 123 456 789 03",
  displayName: "Karate Club Milano",
};

describe("applyAsProvider (handler)", () => {
  beforeEach(() => {
    h.docs.clear();
    h.ops.length = 0;
    h.settings.autoApprove = true;
    h.commitProviderDecision.mockReset();
    h.commitProviderDecision.mockResolvedValue({ draftServicesSeeded: 1 });
    h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer", email: "mario@example.it" });
  });

  it("queues a business for review even with auto-approval ON — commitProviderDecision is never called", async () => {
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toEqual({
      success: true,
      providerId: "u1",
      autoApproved: false,
      draftServicesSeeded: 0,
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();

    expect(h.ops).toEqual([
      ["create", "businessVat/12345678903", { uid: "u1", createdAt: "NOW" }],
      ["set", "instructors/u1", expect.objectContaining({
        name: "Karate Club Milano",
        applicationStatus: "pending",
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        business: expect.objectContaining({ vatNumber: "12345678903" }),
      })],
      ["update", "users/u1", { providerStatus: "pending", providerType: "business", updatedAt: "NOW" }],
    ]);
  });

  it("still auto-approves an individual through commitProviderDecision, as before", async () => {
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).resolves.toMatchObject({
      autoApproved: true,
      draftServicesSeeded: 1,
    });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(1);
    expect(h.commitProviderDecision).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "u1",
      decision: "verified",
      application: { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" },
    }));
    expect(h.ops).toEqual([]);
  });

  it("retries the auto-approval once when the commit lost a race on users/{uid}", async () => {
    h.commitProviderDecision
      .mockRejectedValueOnce(new HttpsError("aborted", "concurrent_update"))
      .mockResolvedValueOnce({ draftServicesSeeded: 1 });
    await expect(call({ categoryIds: ["hiit"] })).resolves.toMatchObject({ autoApproved: true });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(2);
  });

  it("refuses an individual application from an account that is already a business", async () => {
    h.docs.set("users/u1", { fullName: "Mario Rossi", role: "customer", providerType: "business" });
    await expect(call({ categoryIds: ["hiit"] })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "business_account_exists",
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();
    expect(h.ops).toEqual([]);
  });

  it("reads the instructors doc inside the transaction: an approved business cannot change its P.IVA", async () => {
    h.docs.set("instructors/u1", {
      applicationStatus: "verified",
      providerProfile: { isVerified: true },
      business: { ...COMPANY, vatNumber: "00743110157" },
    });
    h.docs.set("businessVat/00743110157", { uid: "u1" });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "vat_change_not_allowed",
    });
    expect(h.ops).toEqual([]);
  });

  it("a pending business moving to a new P.IVA releases the old claim and keeps its profile", async () => {
    h.docs.set("instructors/u1", {
      applicationStatus: "pending",
      providerProfile: { isVerified: false, bio: "Dal 1990", rating: 0, reviewCount: 0 },
      business: { ...COMPANY, vatNumber: "00743110157" },
    });
    h.docs.set("businessVat/00743110157", { uid: "u1" });
    await call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY });
    expect(h.ops.map(([op, path]) => [op, path])).toEqual([
      ["delete", "businessVat/00743110157"],
      ["create", "businessVat/12345678903"],
      ["set", "instructors/u1"],
      ["update", "users/u1"],
    ]);
    const instructorWrite = h.ops[2][2] as Record<string, unknown>;
    expect(instructorWrite.providerProfile).toEqual({ isVerified: false });
    expect(instructorWrite).not.toHaveProperty("createdAt");
  });
});
