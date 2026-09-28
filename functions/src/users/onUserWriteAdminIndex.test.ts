import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { applyUserAdminIndex, userAdminIndexPatch } from "./onUserWriteAdminIndex";
import { computeAdminIndex } from "./adminIndex";

const createTime = Timestamp.fromMillis(1_700_000_000_000);

function indexed(id: string, data: Record<string, unknown>): Record<string, unknown> {
  return { createdAt: createTime, isSuspended: false, ...data, ...computeAdminIndex(id, data) };
}

describe("userAdminIndexPatch", () => {
  it("derives the index fields for a fresh document and fills createdAt/isSuspended", () => {
    const patch = userAdminIndexPatch("u1", { fullName: "Mario Rossi", role: "customer" }, createTime);

    expect(patch).toMatchObject({
      adminHidden: false,
      providerVerification: null,
      createdAt: createTime,
      isSuspended: false,
    });
    expect(patch?.searchTokens).toEqual(expect.arrayContaining(["mario", "rossi", "mario r"]));
  });

  it("is null for a document that is already indexed — the trigger's own write is a no-op", () => {
    const data = indexed("u1", { fullName: "Mario Rossi", email: "m@x.it", role: "provider" });
    expect(userAdminIndexPatch("u1", data, createTime)).toBeNull();
  });

  it("never overwrites an existing createdAt or isSuspended", () => {
    const createdAt = Timestamp.fromMillis(1);
    const data = indexed("u1", { fullName: "A" });
    data.createdAt = createdAt;
    data.isSuspended = true;
    expect(userAdminIndexPatch("u1", data, createTime)).toBeNull();
  });

  it("recomputes only what changed (a rename touches searchTokens alone)", () => {
    const data = indexed("u1", { fullName: "Mario Rossi", role: "customer" });
    data.fullName = "Luigi Verdi";
    const patch = userAdminIndexPatch("u1", data, createTime);
    expect(Object.keys(patch ?? {})).toEqual(["searchTokens"]);
  });

  it("follows a soft delete and a verification decision", () => {
    const data = indexed("u1", { role: "provider" });
    expect(data.providerVerification).toBe("pending");
    data.isDeleted = true;
    data.providerProfile = { isVerified: true };
    expect(userAdminIndexPatch("u1", data, createTime)).toEqual({
      adminHidden: true,
      providerVerification: "verified",
    });
  });
});

describe("applyUserAdminIndex", () => {
  it("writes nothing when nothing changed", async () => {
    const update = vi.fn();
    const data = indexed("u1", { fullName: "A" });
    expect(await applyUserAdminIndex("u1", data, createTime, { update })).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("swallows NOT_FOUND and FAILED_PRECONDITION (deleted / rewritten since the event)", async () => {
    for (const code of [5, 9]) {
      const update = vi.fn(async () => {
        throw Object.assign(new Error("x"), { code });
      });
      await expect(applyUserAdminIndex("u1", { fullName: "A" }, createTime, { update })).resolves.toBe(false);
    }
  });

  it("rethrows anything else so the retry policy can run it again", async () => {
    const update = vi.fn(async () => {
      throw Object.assign(new Error("unavailable"), { code: 14 });
    });
    await expect(applyUserAdminIndex("u1", { fullName: "A" }, createTime, { update })).rejects.toThrow("unavailable");
  });
});
