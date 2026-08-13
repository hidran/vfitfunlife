import { describe, it, expect } from "vitest";
import { lowestActivePrice } from "./lowestPrice";

describe("lowestActivePrice", () => {
  it("returns the cheapest active price", () => {
    expect(
      lowestActivePrice([
        { price: 60, isActive: true },
        { price: 35, isActive: true },
        { price: 90, isActive: true },
      ]),
    ).toBe(35);
  });

  it("ignores inactive services even when they are cheaper", () => {
    expect(
      lowestActivePrice([
        { price: 60, isActive: true },
        { price: 10, isActive: false },
      ]),
    ).toBe(60);
  });

  it("treats a missing isActive as active, for documents predating the field", () => {
    expect(lowestActivePrice([{ price: 42 }])).toBe(42);
  });

  it("returns null when every service is inactive, so the caller deletes the field", () => {
    expect(
      lowestActivePrice([
        { price: 60, isActive: false },
        { price: 35, isActive: false },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty collection", () => {
    expect(lowestActivePrice([])).toBeNull();
  });

  it("skips prices that are not usable numbers rather than yielding NaN", () => {
    expect(
      lowestActivePrice([
        { price: "40", isActive: true },
        { price: null, isActive: true },
        { price: undefined, isActive: true },
        { price: NaN, isActive: true },
        { price: -5, isActive: true },
        { price: 70, isActive: true },
      ]),
    ).toBe(70);
  });

  it("allows a genuinely free service", () => {
    expect(lowestActivePrice([{ price: 0, isActive: true }, { price: 30, isActive: true }])).toBe(0);
  });
});
