import { describe, it, expect, vi } from "vitest";

// Only adminCascadeDeps touches the Admin SDK; the cascade tests below pass fake deps.
const h = await vi.hoisted(async () => {
  const { createFakeFirestore } = await import("../../test/fakes/fakeFirestore");
  return { fake: createFakeFirestore() };
});
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => h.fake.db, FieldValue: h.fake.FieldValue }));
vi.mock("firebase-admin/storage", () => ({ getStorage: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));

import { adminCascadeDeps, deleteUserCascade, ownedStoragePrefixes, type CascadeDeps } from "./deleteUserCascade";

function fakeDeps(overrides: Partial<CascadeDeps> = {}) {
  const calls: string[] = [];
  const deps: CascadeDeps = {
    recursiveDelete: vi.fn(async (p: string) => { calls.push(`fs:${p}`); }),
    deleteProviderApplications: vi.fn(async (uid: string) => { calls.push(`apps:${uid}`); }),
    deleteBusinessVatClaims: vi.fn(async (uid: string) => { calls.push(`vat:${uid}`); }),
    deleteStoragePrefix: vi.fn(async (p: string) => { calls.push(`st:${p}`); }),
    deleteAuthUser: vi.fn(async (uid: string) => { calls.push(`auth:${uid}`); }),
    ...overrides,
  };
  return { deps, calls };
}

describe("ownedStoragePrefixes", () => {
  it("is scoped to the uid's own folder in every prefix", () => {
    for (const prefix of ownedStoragePrefixes("u1")) {
      expect(prefix).toMatch(/\/u1\/$/);
    }
  });
});

describe("deleteUserCascade", () => {
  it("deletes Auth, then instructors, provider applications, tax-id claims and Storage, and users/{uid} LAST", async () => {
    // users/{uid} must be the last thing removed: while it's still there, the user stays
    // listed in /admin/users and a partial failure can be found and retried (single delete
    // or a new bulk job) instead of vanishing with its instructor profile/avatars orphaned.
    const { deps, calls } = fakeDeps();
    await deleteUserCascade("u1", deps);
    expect(calls[0]).toBe("auth:u1");
    expect(calls[1]).toBe("fs:instructors/u1");
    expect(calls[2]).toBe("apps:u1");
    expect(calls[3]).toBe("vat:u1");
    expect(calls.slice(4, calls.length - 1)).toEqual(ownedStoragePrefixes("u1").map((p) => `st:${p}`));
    expect(calls.at(-1)).toBe("fs:users/u1");
  });

  it("releases the deleted account's businessVat claims, so the tax id is free for its real owner", async () => {
    const { deps } = fakeDeps();
    await deleteUserCascade("u1", deps);
    expect(deps.deleteBusinessVatClaims).toHaveBeenCalledWith("u1");
  });

  it("deletes providerApplications for the uid", async () => {
    const { deps } = fakeDeps();
    await deleteUserCascade("u1", deps);
    expect(deps.deleteProviderApplications).toHaveBeenCalledWith("u1");
  });

  it("treats a missing Auth account as already gone", async () => {
    const { deps } = fakeDeps({
      deleteAuthUser: vi.fn(async () => { throw Object.assign(new Error("gone"), { code: "auth/user-not-found" }); }),
    });
    await expect(deleteUserCascade("customer_1_0", deps)).resolves.toBeUndefined();
    expect(deps.recursiveDelete).toHaveBeenCalledWith("users/customer_1_0");
  });

  it("stops on any other Auth error, before touching data", async () => {
    const { deps } = fakeDeps({ deleteAuthUser: vi.fn(async () => { throw new Error("quota"); }) });
    await expect(deleteUserCascade("u1", deps)).rejects.toThrow("quota");
    expect(deps.recursiveDelete).not.toHaveBeenCalled();
    expect(deps.deleteProviderApplications).not.toHaveBeenCalled();
    expect(deps.deleteBusinessVatClaims).not.toHaveBeenCalled();
    expect(deps.deleteStoragePrefix).not.toHaveBeenCalled();
  });

  it("refuses a uid that would escape its document path", async () => {
    const { deps } = fakeDeps();
    await expect(deleteUserCascade("a/b", deps)).rejects.toThrow("Invalid uid");
    await expect(deleteUserCascade("", deps)).rejects.toThrow("Invalid uid");
  });
});

describe("adminCascadeDeps().deleteBusinessVatClaims", () => {
  it("deletes every claim held by the uid and leaves other accounts' claims alone", async () => {
    h.fake.reset();
    h.fake.put("businessVat/12345678903", { uid: "u1", createdAt: "T0" });
    h.fake.put("businessVat/00743110157", { uid: "u1", createdAt: "T1" });
    h.fake.put("businessVat/01114601006", { uid: "u2", createdAt: "T2" });

    await adminCascadeDeps().deleteBusinessVatClaims("u1");
    expect(h.fake.read("businessVat/12345678903")).toBeUndefined();
    expect(h.fake.read("businessVat/00743110157")).toBeUndefined();
    expect(h.fake.read("businessVat/01114601006")).toEqual({ uid: "u2", createdAt: "T2" });

    // Idempotent: a resumed cascade finds nothing left to delete.
    await expect(adminCascadeDeps().deleteBusinessVatClaims("u1")).resolves.toBeUndefined();
  });
});
