import { describe, it, expect } from "vitest";
import { buildNotification, hasCoordinates, shouldNotify, LINK } from "./missingLocation.mjs";

describe("shouldNotify", () => {
  const provider = { providerStatus: "verified" };

  it("targets a provider account whose instructor doc has no coordinates", () => {
    expect(shouldNotify({ city: "Bari" }, provider)).toBe(true);
    expect(shouldNotify({}, { providerStatus: "pending" })).toBe(true);
    expect(shouldNotify({}, { role: "provider" })).toBe(true);
  });

  it("skips providers with a location, catalog/activity entries, and non-providers", () => {
    expect(shouldNotify({ lat: 45, lng: 9 }, provider)).toBe(false);
    expect(shouldNotify({ activityKind: "gym" }, provider)).toBe(false);
    expect(shouldNotify({}, { role: "customer" })).toBe(false);
    expect(shouldNotify({}, null)).toBe(false);
  });

  it("treats (0, 0) and non-numeric coordinates as missing", () => {
    expect(hasCoordinates({ lat: 0, lng: 0 })).toBe(false);
    expect(hasCoordinates({ lat: "45", lng: 9 })).toBe(false);
  });
});

describe("buildNotification", () => {
  it("has the notify.ts shape with type system and a link to the location editor", () => {
    expect(buildNotification("en", "TS")).toEqual({
      title: "Add your location",
      body: expect.stringContaining("near me"),
      type: "system",
      data: { link: LINK },
      imageUrl: null,
      isRead: false,
      createdAt: "TS",
    });
  });

  it("falls back to Italian for a missing or unknown language", () => {
    expect(buildNotification(undefined, "TS").title).toBe("Aggiungi la tua posizione");
    expect(buildNotification("pt", "TS").title).toBe("Aggiungi la tua posizione");
    expect(buildNotification("de", "TS").title).toBe("Standort hinzufügen");
  });
});
