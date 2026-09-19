import { describe, it, expect, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { syncInstructorFromServices, isParentNotFound, type SyncInstructorDeps } from "./onServiceWrite";

function deps(overrides: Partial<SyncInstructorDeps> = {}): SyncInstructorDeps {
  return {
    getServices: vi.fn(async () => []),
    updateInstructor: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("syncInstructorFromServices", () => {
  it("updates the instructor with the lowest active price and derived category ids", async () => {
    const updateInstructor = vi.fn(async () => undefined);
    const d = deps({
      getServices: vi.fn(async () => [
        { price: 50, isActive: true, categoryId: "yoga" },
        { price: 30, isActive: false, categoryId: "pilates" }, // inactive: excluded from both
      ]),
      updateInstructor,
    });

    await syncInstructorFromServices(d);

    expect(updateInstructor).toHaveBeenCalledTimes(1);
    const patch = updateInstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.lowestPrice).toBe(50);
    expect(patch.hourlyRate).toBe(50);
    expect(patch.categoryIds).toContain("yoga");
    expect(patch.categoryIds).not.toContain("pilates");
  });

  it("deletes lowestPrice/hourlyRate (rather than writing 0) when nothing is sellable", async () => {
    const updateInstructor = vi.fn(async () => undefined);
    const d = deps({ getServices: vi.fn(async () => []), updateInstructor });

    await syncInstructorFromServices(d);

    const patch = updateInstructor.mock.calls[0][0] as Record<string, unknown>;
    expect((patch.lowestPrice as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    expect((patch.hourlyRate as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    expect(patch.categoryIds).toEqual([]);
  });

  it("treats a NOT_FOUND parent (deleted mid-cascade) as nothing to sync, and returns quietly", async () => {
    const updateInstructor = vi.fn(async () => {
      throw Object.assign(new Error("No document to update"), { code: 5 });
    });
    const d = deps({ updateInstructor });

    await expect(syncInstructorFromServices(d)).resolves.toBeUndefined();
  });

  it("rethrows any other error", async () => {
    const updateInstructor = vi.fn(async () => {
      throw Object.assign(new Error("permission denied"), { code: 7 });
    });
    const d = deps({ updateInstructor });

    await expect(syncInstructorFromServices(d)).rejects.toThrow("permission denied");
  });
});

describe("isParentNotFound", () => {
  it("is true for gRPC code 5 (NOT_FOUND)", () => {
    expect(isParentNotFound({ code: 5 })).toBe(true);
  });

  it("is false for any other code, or no code at all", () => {
    expect(isParentNotFound({ code: 7 })).toBe(false);
    expect(isParentNotFound(new Error("x"))).toBe(false);
  });
});
