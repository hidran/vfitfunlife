import { describe, it, expect } from "vitest";
import { activeCategoryIds } from "./deriveCategories";

describe("activeCategoryIds", () => {
  it("expands a leaf to include its group, so a group filter finds the provider", () => {
    expect(activeCategoryIds([{ categoryId: "boxing", isActive: true }])).toEqual([
      "boxing",
      "combat",
    ]);
  });

  it("de-duplicates a shared ancestor across services", () => {
    expect(
      activeCategoryIds([
        { categoryId: "yoga", isActive: true },
        { categoryId: "pilates", isActive: true },
      ]),
    ).toEqual(["mind_body", "pilates", "yoga"]);
  });

  it("ignores inactive services — they cannot be booked", () => {
    expect(
      activeCategoryIds([
        { categoryId: "boxing", isActive: false },
        { categoryId: "yoga", isActive: true },
      ]),
    ).toEqual(["mind_body", "yoga"]);
  });

  it("treats a missing isActive as active, matching the lowestPrice rule", () => {
    expect(activeCategoryIds([{ categoryId: "cardio" }])).toEqual([
      "cardio",
      "cardio_endurance",
    ]);
  });

  it("empties when the last active service is deactivated", () => {
    expect(activeCategoryIds([{ categoryId: "boxing", isActive: false }])).toEqual([]);
  });

  it("skips services with no category rather than inventing one", () => {
    expect(
      activeCategoryIds([{ isActive: true }, { categoryId: "", isActive: true }]),
    ).toEqual([]);
  });

  it("is sorted, so an unrelated edit does not churn the stored array", () => {
    const a = activeCategoryIds([
      { categoryId: "yoga", isActive: true },
      { categoryId: "boxing", isActive: true },
    ]);
    const b = activeCategoryIds([
      { categoryId: "boxing", isActive: true },
      { categoryId: "yoga", isActive: true },
    ]);
    expect(a).toEqual(b);
  });
});
