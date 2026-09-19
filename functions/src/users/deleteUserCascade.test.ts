import { describe, it, expect, vi } from "vitest";
import { deleteUserCascade, ownedStoragePrefixes, type CascadeDeps } from "./deleteUserCascade";

function fakeDeps(overrides: Partial<CascadeDeps> = {}) {
  const calls: string[] = [];
  const deps: CascadeDeps = {
    recursiveDelete: vi.fn(async (p: string) => { calls.push(`fs:${p}`); }),
    deleteProviderApplications: vi.fn(async (uid: string) => { calls.push(`apps:${uid}`); }),
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
  it("deletes Auth first, then Firestore docs, then provider applications, then Storage", async () => {
    const { deps, calls } = fakeDeps();
    await deleteUserCascade("u1", deps);
    expect(calls[0]).toBe("auth:u1");
    expect(calls.slice(1, 3)).toEqual(["fs:users/u1", "fs:instructors/u1"]);
    expect(calls[3]).toBe("apps:u1");
    expect(calls.slice(4)).toEqual(ownedStoragePrefixes("u1").map((p) => `st:${p}`));
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
    expect(deps.deleteStoragePrefix).not.toHaveBeenCalled();
  });

  it("refuses a uid that would escape its document path", async () => {
    const { deps } = fakeDeps();
    await expect(deleteUserCascade("a/b", deps)).rejects.toThrow("Invalid uid");
    await expect(deleteUserCascade("", deps)).rejects.toThrow("Invalid uid");
  });
});
