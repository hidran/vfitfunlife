import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The legacy `verifyProvider` callable (no client calls it any more, but it is still deployed)
 * must not approve a company: only decideProviderApplication checks that the admin reviewed
 * the tax id and legal name being approved (plan 2026-10-04, B8). A company is refused with
 * `failed-precondition` / `use_decide_provider_application` before anything is written;
 * individuals are verified exactly as before.
 */

type Write = [op: string, path: string, data?: unknown];

const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: Write[] = [];
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    update: async (data: unknown) => {
      writes.push(["update", path, data]);
    },
    set: async (data: unknown) => {
      writes.push(["set", path, data]);
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      add: async (data: unknown) => {
        writes.push(["add", name, data]);
      },
    }),
  };
  return {
    docs,
    writes,
    db,
    requireAdmin: vi.fn(async (_uid: string) => {}),
    seed: vi.fn(async (_id: string, _type?: string) => {}),
    audit: vi.fn(async (_payload: unknown) => {}),
  };
});

vi.mock("firebase-admin", () => ({
  firestore: () => h.db,
  apps: [{}],
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "NOW" },
  getFirestore: () => h.db,
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

beforeEach(() => {
  h.docs.clear();
  h.writes.length = 0;
  vi.clearAllMocks();
  h.docs.set("users/admin-1", { role: "admin", email: "admin@example.it" });
});

describe("verifyProvider (legacy callable)", () => {
  it("refuses a company whose instructors doc has a business map, writing nothing", async () => {
    h.docs.set("users/c1", { role: "provider", providerProfile: { isVerified: false } });
    h.docs.set("instructors/c1", { applicationStatus: "pending", business: COMPANY });

    await expect(call({ providerId: "c1", verified: true })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "use_decide_provider_application",
    });
    expect(h.writes).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
  });

  it("refuses a company marked only on users.providerType, and un-verifying one too", async () => {
    h.docs.set("users/c1", { role: "provider", providerType: "business", providerProfile: { isVerified: true } });
    h.docs.set("instructors/c1", { applicationStatus: "approved" });

    for (const verified of [true, false]) {
      await expect(call({ providerId: "c1", verified })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "use_decide_provider_application",
      });
    }
    expect(h.writes).toEqual([]);
  });

  it("verifies an individual as before", async () => {
    h.docs.set("users/p1", { role: "provider", userType: "personal_trainer", providerProfile: { isVerified: false } });
    h.docs.set("instructors/p1", { applicationStatus: "pending" });

    await expect(call({ providerId: "p1", verified: true })).resolves.toMatchObject({
      success: true,
      providerId: "p1",
      verified: true,
    });
    expect(h.writes.map(([op, path]) => `${op} ${path}`)).toEqual([
      "update users/p1",
      "set instructors/p1",
      "add verificationLogs",
    ]);
    expect(h.seed).toHaveBeenCalledWith("p1", "personal_trainer");
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it("still does not create a catalogue entry for an individual who has none", async () => {
    h.docs.set("users/p2", { role: "provider", providerProfile: { isVerified: false } });

    await call({ providerId: "p2", verified: true });
    expect(h.writes.map(([op, path]) => `${op} ${path}`)).toEqual(["update users/p2", "add verificationLogs"]);
  });
});
