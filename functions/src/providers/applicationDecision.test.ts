import { describe, it, expect, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  decisionInstructorPatch,
  draftServicesForCategories,
  retryOnceOnConcurrentUpdate,
  toConcurrentUpdateError,
  instructorVerificationPatch,
  needsDefaultHours,
  pendingApplicationPatches,
  resolveLegacySpecialties,
  providerRolePatch,
} from "./applicationDecision";
import { validateBusinessInput } from "./businessApplication";
import { DEFAULT_WEEKLY_HOURS } from "../availability/slots";

/** Stands in for FieldValue.serverTimestamp(); the builders only pass it through. */
const NOW = { sentinel: "serverTimestamp" };

/** Every key, at any depth, whose name contains a dot. */
function dottedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => dottedKeys(v, `${path}${i}/`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${path}${k}`] : []),
    ...dottedKeys(v, `${path}${k}/`),
  ]);
}

const COMPANY = validateBusinessInput({
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "IT 12345678903",
  displayName: "Karate Club Milano",
  city: "Milano",
});

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

describe("instructorVerificationPatch", () => {
  it("nests isVerified under providerProfile", () => {
    expect(instructorVerificationPatch(true)).toEqual({ providerProfile: { isVerified: true } });
    expect(instructorVerificationPatch(false)).toEqual({ providerProfile: { isVerified: false } });
  });

  it("uses no dotted key, because the patch is applied with set(merge) which would take one literally", () => {
    // The regression: `{ "providerProfile.isVerified": true }` through set(..., { merge: true })
    // writes a top-level field *named* "providerProfile.isVerified" and leaves the nested
    // providerProfile.isVerified at false. firestore.rules gates the public read of
    // instructors/{id} on the nested value, so approval silently left the provider
    // unreadable to customers — unsearchable and unbookable.
    for (const verified of [true, false]) {
      const keys = Object.keys(instructorVerificationPatch(verified));
      expect(keys.some((k) => k.includes("."))).toBe(false);
    }
  });
});

describe("pendingApplicationPatches", () => {
  it("queues a first-time individual exactly as before business accounts existed", () => {
    expect(
      pendingApplicationPatches({
        uid: "u1",
        applicantName: "Mario Rossi",
        requestedLeaves: ["hiit"],
        now: NOW,
        instructorExists: false,
      }),
    ).toEqual({
      instructor: {
        uid: "u1",
        name: "Mario Rossi",
        fullName: "Mario Rossi",
        isActive: true,
        requestedCategoryIds: ["hiit"],
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        applicationStatus: "pending",
        createdAt: NOW,
        updatedAt: NOW,
      },
      // No providerType: absent already means individual, and nothing else changes.
      user: { providerStatus: "pending", updatedAt: NOW },
    });
  });

  it("queues a business under its public name, with the details nested and the account typed", () => {
    const { instructor, user } = pendingApplicationPatches({
      uid: "u2",
      applicantName: "Mario Rossi",
      requestedLeaves: ["hiit"],
      now: NOW,
      business: COMPANY,
      instructorExists: false,
    });

    expect(instructor).toEqual({
      uid: "u2",
      name: "Karate Club Milano",
      fullName: "Karate Club Milano",
      isActive: true,
      requestedCategoryIds: ["hiit"],
      providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
      applicationStatus: "pending",
      createdAt: NOW,
      updatedAt: NOW,
      business: {
        legalName: "Karate Club Milano S.r.l.",
        vatNumber: "12345678903",
        displayName: "Karate Club Milano",
        description: "",
        website: null,
        city: "Milano",
      },
    });
    expect(user).toEqual({ providerStatus: "pending", providerType: "business", updatedAt: NOW });
  });

  it("seeds nothing that would make a pending applicant bookable", () => {
    for (const business of [undefined, COMPANY]) {
      const { instructor } = pendingApplicationPatches({
        uid: "u3", applicantName: null, requestedLeaves: [], now: NOW, business, instructorExists: false,
      });
      expect(instructor).not.toHaveProperty("availabilitySchedule");
      expect(instructor.providerProfile).toMatchObject({ isVerified: false });
    }
  });

  it("uses no dotted key at any depth in either write", () => {
    // The instructors write is set(..., { merge: true }), which stores a dotted key as a
    // literal field name instead of a nested path.
    for (const business of [undefined, COMPANY]) {
      for (const instructorExists of [true, false]) {
        const patches = pendingApplicationPatches({
          uid: "u4", applicantName: "Mario Rossi", requestedLeaves: ["hiit"], now: NOW, business, instructorExists,
        });
        expect(dottedKeys(patches)).toEqual([]);
      }
    }
  });

  it("a re-apply keeps the profile's bio, rating, review count and createdAt", () => {
    // set(merge) merges providerProfile field by field, so writing only isVerified leaves the
    // rest of an existing profile alone; the defaults are for a brand-new document only.
    for (const business of [undefined, COMPANY]) {
      const { instructor } = pendingApplicationPatches({
        uid: "u5", applicantName: "Mario Rossi", requestedLeaves: ["hiit"], now: NOW, business, instructorExists: true,
      });
      expect(instructor.providerProfile).toEqual({ isVerified: false });
      expect(instructor).not.toHaveProperty("createdAt");
      expect(instructor).toMatchObject({ applicationStatus: "pending", updatedAt: NOW, requestedCategoryIds: ["hiit"] });
    }
  });
});

describe("toConcurrentUpdateError", () => {
  it("turns a failed write precondition (gRPC 9) into a retryable, client-mappable error", () => {
    const mapped = toConcurrentUpdateError(Object.assign(new Error("FAILED_PRECONDITION: stale"), { code: 9 }));
    expect(mapped).toBeInstanceOf(HttpsError);
    expect(mapped).toMatchObject({ code: "aborted", message: "concurrent_update" });
  });

  it("passes every other error through untouched", () => {
    const others = [
      Object.assign(new Error("not found"), { code: 5 }),
      new Error("boom"),
      new HttpsError("failed-precondition", "business_account_exists"),
      "a string",
    ];
    for (const err of others) {
      expect(toConcurrentUpdateError(err)).toBe(err);
    }
  });
});

describe("retryOnceOnConcurrentUpdate", () => {
  const concurrent = () => new HttpsError("aborted", "concurrent_update");

  it("runs the work once when it succeeds", async () => {
    const work = vi.fn().mockResolvedValue("ok");
    await expect(retryOnceOnConcurrentUpdate(work)).resolves.toBe("ok");
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("re-runs the work once after a concurrent update, so it re-reads and re-checks", async () => {
    const work = vi.fn().mockRejectedValueOnce(concurrent()).mockResolvedValueOnce("ok");
    await expect(retryOnceOnConcurrentUpdate(work)).resolves.toBe("ok");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second concurrent update and reports it", async () => {
    const work = vi.fn().mockRejectedValue(concurrent());
    await expect(retryOnceOnConcurrentUpdate(work)).rejects.toMatchObject({
      code: "aborted",
      message: "concurrent_update",
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("never retries any other error", async () => {
    const err = new HttpsError("failed-precondition", "business_account_exists");
    const work = vi.fn().mockRejectedValue(err);
    await expect(retryOnceOnConcurrentUpdate(work)).rejects.toBe(err);
    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe("decisionInstructorPatch", () => {
  const companyInstructor = {
    uid: "biz",
    name: "Karate Club Milano",
    fullName: "Karate Club Milano",
    business: COMPANY,
    applicationStatus: "pending",
    providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
  };

  it("approving a business keeps the company name, even when an applicant name is passed", () => {
    const patch = decisionInstructorPatch({
      providerId: "biz",
      decision: "verified",
      instructorExists: true,
      instructor: companyInstructor,
      userFullName: "Mario Rossi",
      application: { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" },
      requestedLeaves: ["hiit"],
      now: NOW,
    });
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("fullName");
    expect(patch).toMatchObject({ applicationStatus: "verified", providerProfile: { isVerified: true } });
  });

  it("an admin approving or rejecting a business leaves its name and business details untouched", () => {
    for (const decision of ["verified", "rejected"] as const) {
      const patch = decisionInstructorPatch({
        providerId: "biz",
        decision,
        instructorExists: true,
        instructor: companyInstructor,
        userFullName: "Mario Rossi",
        requestedLeaves: [],
        now: NOW,
      });
      expect(patch).not.toHaveProperty("name");
      expect(patch).not.toHaveProperty("fullName");
      expect(patch).not.toHaveProperty("business");
      expect(patch.applicationStatus).toBe(decision);
    }
  });

  it("still names an individual after their application, as before", () => {
    const patch = decisionInstructorPatch({
      providerId: "u1",
      decision: "verified",
      instructorExists: true,
      instructor: { name: "Old Name", availabilitySchedule: DEFAULT_WEEKLY_HOURS },
      userFullName: "Ignored",
      application: { requestedCategoryIds: ["hiit", "strength_conditioning"], fullName: "Mario Rossi" },
      requestedLeaves: ["hiit"],
      now: NOW,
    });
    expect(patch).toEqual({
      applicationStatus: "verified",
      providerProfile: { isVerified: true },
      updatedAt: NOW,
      requestedCategoryIds: ["hiit"],
      name: "Mario Rossi",
      fullName: "Mario Rossi",
    });
  });

  it("does not touch the name when the application carries none", () => {
    const patch = decisionInstructorPatch({
      providerId: "u1",
      decision: "verified",
      instructorExists: true,
      instructor: { name: "Mario Rossi", availabilitySchedule: DEFAULT_WEEKLY_HOURS },
      userFullName: "Mario Rossi",
      application: { requestedCategoryIds: [], fullName: null },
      requestedLeaves: [],
      now: NOW,
    });
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("fullName");
  });

  it("creates the catalogue entry for a provider without an instructors doc, as before", () => {
    expect(
      decisionInstructorPatch({
        providerId: "admin-made",
        decision: "verified",
        instructorExists: false,
        instructor: {},
        userFullName: "Giulia Bianchi",
        requestedLeaves: [],
        now: NOW,
      }),
    ).toEqual({
      applicationStatus: "verified",
      providerProfile: { isVerified: true },
      updatedAt: NOW,
      uid: "admin-made",
      fullName: "Giulia Bianchi",
      isActive: true,
      createdAt: NOW,
      availabilitySchedule: DEFAULT_WEEKLY_HOURS,
    });
  });

  it("seeds default hours on approval only, and never over existing hours", () => {
    const base = {
      providerId: "u1", instructorExists: true, userFullName: null, requestedLeaves: [], now: NOW,
    };
    expect(decisionInstructorPatch({ ...base, decision: "verified", instructor: {} }).availabilitySchedule)
      .toEqual(DEFAULT_WEEKLY_HOURS);
    expect(decisionInstructorPatch({ ...base, decision: "rejected", instructor: {} }))
      .not.toHaveProperty("availabilitySchedule");
    const own = [{ dayOfWeek: 6, startTime: "10:00", endTime: "12:00", isAvailable: true }];
    expect(decisionInstructorPatch({ ...base, decision: "verified", instructor: { availabilitySchedule: own } }))
      .not.toHaveProperty("availabilitySchedule");
  });

  it("uses no dotted key at any depth", () => {
    for (const decision of ["verified", "rejected"] as const) {
      for (const instructorExists of [true, false]) {
        const patch = decisionInstructorPatch({
          providerId: "biz",
          decision,
          instructorExists,
          instructor: instructorExists ? companyInstructor : {},
          userFullName: "Mario Rossi",
          application: { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" },
          requestedLeaves: ["hiit"],
          now: NOW,
        });
        expect(dottedKeys(patch)).toEqual([]);
      }
    }
  });
});
