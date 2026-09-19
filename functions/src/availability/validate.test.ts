import { describe, it, expect } from "vitest";
import { validateSlotsRequest } from "./validate";

describe("validateSlotsRequest", () => {
  it("accepts ids and a date", () => {
    expect(validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" }))
      .toEqual({ instructorId: "i1", serviceId: "s1", date: "2026-09-21" });
  });

  it("rejects path-like ids and bad dates", () => {
    expect(() => validateSlotsRequest({ instructorId: "a/b", serviceId: "s1", date: "2026-09-21" }))
      .toThrow(/instructorId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "", date: "2026-09-21" }))
      .toThrow(/serviceId/);
    expect(() => validateSlotsRequest({ instructorId: "i1", serviceId: "s1", date: "21/09/2026" }))
      .toThrow(/date/);
  });
});
