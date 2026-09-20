import { describe, it, expect } from "vitest";
import {
  draftServicesForCategories,
  needsDefaultHours,
  resolveLegacySpecialties,
  providerRolePatch,
} from "./applicationDecision";

describe("draftServicesForCategories", () => {
  it("builds one inactive, unpriced draft per requested leaf, named in the provider's locale", () => {
    const drafts = draftServicesForCategories(["personal_training", "hiit"], "en");

    expect(drafts).toEqual([
      {
        id: "requested-personal_training",
        data: {
          name: "Personal Training",
          description: "",
          durationMinutes: 60,
          price: 0,
          isActive: false,
          categoryId: "personal_training",
          categoryIds: ["personal_training", "strength_conditioning"],
        },
      },
      expect.objectContaining({
        id: "requested-hiit",
        data: expect.objectContaining({ categoryId: "hiit", isActive: false, price: 0 }),
      }),
    ]);
  });

  it("falls back to Italian names for an unknown locale", () => {
    const [draft] = draftServicesForCategories(["cardio"], "pt");
    expect(draft.data.name).toBe("Cardio");
  });

  it("skips groups, unknown ids and duplicates — a service must sit on a known leaf", () => {
    const drafts = draftServicesForCategories(
      ["strength_conditioning", "not_a_category", "hiit", "hiit"],
      "it",
    );
    expect(drafts.map((d) => d.data.categoryId)).toEqual(["hiit"]);
  });
});

describe("resolveLegacySpecialties", () => {
  it("maps stored display names in any locale to leaf ids and reports the rest", () => {
    expect(
      resolveLegacySpecialties(["Personal Training", "Forza e Condizionamento", "HIIT", "Underwater Chess"]),
    ).toEqual({
      leafIds: ["personal_training", "hiit"],
      unmapped: ["Forza e Condizionamento", "Underwater Chess"],
    });
  });

  it("dedupes names that resolve to the same leaf", () => {
    expect(resolveLegacySpecialties(["hiit", "HIIT"]).leafIds).toEqual(["hiit"]);
  });
});

describe("needsDefaultHours", () => {
  it("is true for a provider with no schedule at all", () => {
    expect(needsDefaultHours(undefined)).toBe(true);
    expect(needsDefaultHours({})).toBe(true);
    expect(needsDefaultHours({ availabilitySchedule: [] })).toBe(true);
    expect(needsDefaultHours({ availabilitySchedule: null })).toBe(true);
  });

  it("is false once the provider has any real hours, however they got there", () => {
    expect(needsDefaultHours({
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isAvailable: true }],
    })).toBe(false);
    // Legacy weekday-map shape (normalizeAvailability understands both).
    expect(needsDefaultHours({
      availabilitySchedule: { monday: { isAvailable: true, slots: [{ start: "09:00", end: "12:00" }] } },
    })).toBe(false);
  });
});

describe("providerRolePatch", () => {
  const providerDefaults = ["bookings:read", "services:read", "venues:read"];

  it("promotes a customer to provider, keeping the customer permissions they book with", () => {
    expect(providerRolePatch("customer", ["bookings:read", "bookings:write"], providerDefaults)).toEqual({
      role: "provider",
      permissions: ["bookings:read", "bookings:write", "services:read", "venues:read"],
    });
  });

  it("promotes a user with no role or permissions to the provider defaults", () => {
    expect(providerRolePatch(undefined, undefined, providerDefaults)).toEqual({
      role: "provider",
      permissions: providerDefaults,
    });
  });

  it("leaves providers and staff roles untouched", () => {
    expect(providerRolePatch("provider", [], providerDefaults)).toBeNull();
    expect(providerRolePatch("admin", [], providerDefaults)).toBeNull();
    expect(providerRolePatch("superadmin", [], providerDefaults)).toBeNull();
  });
});
