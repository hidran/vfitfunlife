import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The legacy `verifyProvider` callable (no client calls it any more, but it is still deployed)
 * must not approve a company: only decideProviderApplication checks that the admin reviewed
 * the tax id and legal name being approved and that the company holds its tax-id claim (plan
 * 2026-10-04, B8). A company is refused with `failed-precondition` /
 * `use_decide_provider_application` before anything is written — and because the guard and the
 * writes are one transaction, also when the company application lands between the guard's read
 * and the write. Individuals are verified exactly as before.
 *
 * Runs over the shared stateful Firestore fake (test/fakes/fakeFirestore.ts).
 */

const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return {
    fake: createFakeFirestore(),
    requireAdmin: vi.fn(async (_uid: string) => {}),
    seed: vi.fn(async (_id: string, _type?: string) => {}),
    audit: vi.fn(async (_payload: unknown) => {}),
  };
});
const { fake } = h;

vi.mock("firebase-admin", () => ({
  firestore: () => h.fake.db,
  apps: [{}],
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: h.fake.FieldValue,
  getFirestore: () => h.fake.db,
}));
vi.mock("../utils/roles", () => ({
  requireAdmin: (uid: string) => h.requireAdmin(uid),
  getUserRoleInfo: vi.fn(),
  isValidRole: vi.fn(),
  calculatePermissions: vi.fn(),
  getDefaultPermissionsForRole: vi.fn(() => []),
  getProviderTypeList: vi.fn(() => []),
}));
vi.mock("../lib/audit", () => ({
  writeAuditLog: (payload: unknown) => h.audit(payload),
  toActorRole: (role: unknown) => role,
}));
vi.mock("../providers/seedProviderServices", () => ({
  seedProviderServicesFromTemplates: (id: string, type?: string) => h.seed(id, type),
}));

import { verifyProvider } from "./roles";

type Callable = { run: (r: unknown) => Promise<unknown> };
const call = (data: Record<string, unknown>) =>
  (verifyProvider as unknown as Callable).run({ auth: { uid: "admin-1", token: {} }, data });

const COMPANY = { legalName: "Karate Club Milano S.r.l.", vatNumber: "12345678903", displayName: "Karate Club" };
/** Each committed write as "op collection-or-doc", auto ids dropped. */
const writes = () => fake.ops.map(([op, path]) => `${op} ${op === "add" ? path.split("/")[0] : path}`);
const listed = (uid: string) =>
  (fake.read(`instructors/${uid}`)?.providerProfile as { isVerified?: boolean } | undefined)?.isVerified === true;

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  fake.put("users/admin-1", { role: "admin", email: "admin@example.it" });
});

describe("verifyProvider (legacy callable)", () => {
  it("refuses a company whose instructors doc has a business map, writing nothing", async () => {
    fake.put("users/c1", { role: "provider", providerProfile: { isVerified: false } });
    fake.put("instructors/c1", { applicationStatus: "pending", business: COMPANY });

    await expect(call({ providerId: "c1", verified: true })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "use_decide_provider_application",
    });
    expect(fake.ops).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
  });

  it("refuses a company marked only on users.providerType, and un-verifying one too", async () => {
    fake.put("users/c1", { role: "provider", providerType: "business", providerProfile: { isVerified: true } });
    fake.put("instructors/c1", { applicationStatus: "approved" });

    for (const verified of [true, false]) {
      await expect(call({ providerId: "c1", verified })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "use_decide_provider_application",
      });
    }
    expect(fake.ops).toEqual([]);
  });

  it("a company application landing between the guard's read and the write is refused on the re-run — nothing listed", async () => {
    fake.put("users/p1", { role: "provider", providerProfile: { isVerified: false } });
    fake.put("instructors/p1", { applicationStatus: "pending", providerProfile: { isVerified: false } });
    fake.state.beforeCommit = () => {
      fake.put("users/p1", { role: "provider", providerType: "business", providerStatus: "pending" });
      fake.put("instructors/p1", { applicationStatus: "pending", providerProfile: { isVerified: false }, business: COMPANY });
    };

    await expect(call({ providerId: "p1", verified: true })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "use_decide_provider_application",
    });
    expect(fake.state.attempts).toBe(2);
    expect(fake.ops).toEqual([]);
    expect(listed("p1")).toBe(false);
    expect(h.seed).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("verifies an individual as before", async () => {
    fake.put("users/p1", { role: "provider", userType: "personal_trainer", providerProfile: { isVerified: false, bio: "x" } });
    fake.put("instructors/p1", { applicationStatus: "pending", providerProfile: { isVerified: false, rating: 4 } });

    await expect(call({ providerId: "p1", verified: true })).resolves.toMatchObject({
      success: true,
      providerId: "p1",
      verified: true,
    });
    expect(writes()).toEqual(["update users/p1", "set instructors/p1", "add verificationLogs"]);
    expect(fake.read("users/p1")).toMatchObject({ isVerified: true, providerProfile: { isVerified: true, bio: "x" } });
    expect(fake.read("instructors/p1")).toMatchObject({ providerProfile: { isVerified: true, rating: 4 } });
    expect(h.seed).toHaveBeenCalledWith("p1", "personal_trainer");
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it("an id that can't name a document is invalid_provider_id, not internal", async () => {
    for (const providerId of ["a/b", "", undefined]) {
      await expect(call({ providerId, verified: true })).rejects.toMatchObject({
        code: "invalid-argument",
        message: "invalid_provider_id",
      });
    }
    expect(fake.ops).toEqual([]);
  });

  it("still does not create a catalogue entry for an individual who has none", async () => {
    fake.put("users/p2", { role: "provider", providerProfile: { isVerified: false } });

    await call({ providerId: "p2", verified: true });
    expect(writes()).toEqual(["update users/p2", "add verificationLogs"]);
    expect(fake.read("instructors/p2")).toBeUndefined();
  });
});
