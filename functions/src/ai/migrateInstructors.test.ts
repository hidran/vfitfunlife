import { describe, it, expect, vi } from "vitest";

// migrateInstructors.ts transitively imports ../utils/roles, which calls
// admin.firestore() at module scope. Stub it so the module loads without
// an initialized Firebase app — the pure helpers under test touch neither.
vi.mock("firebase-admin", () => ({ firestore: () => ({}) }));

import { liftProviderProfileFields, nearestCity } from "./migrateInstructors";

describe("liftProviderProfileFields", () => {
  it("lifts rating→ratingAvg and other fields when top-level is missing", () => {
    const patch = liftProviderProfileFields({
      providerProfile: {
        rating: 4.7,
        reviewCount: 42,
        hourlyRate: 65,
        specialties: ["Yoga"],
        languages: ["Italiano"],
      },
    });
    expect(patch).toEqual({
      ratingAvg: 4.7,
      reviewCount: 42,
      hourlyRate: 65,
      specialties: ["Yoga"],
      languages: ["Italiano"],
    });
  });

  it("does NOT overwrite fields already present at top level", () => {
    const patch = liftProviderProfileFields({
      ratingAvg: 5.0,
      reviewCount: 10,
      specialties: ["Pilates"],
      languages: ["English"],
      hourlyRate: 80,
      providerProfile: {
        rating: 4.0,
        reviewCount: 99,
        specialties: ["Yoga"],
        languages: ["Italiano"],
        hourlyRate: 30,
      },
    });
    expect(patch).toEqual({});
  });

  it("returns empty patch when there is no providerProfile", () => {
    expect(liftProviderProfileFields({ ratingAvg: 4.1 })).toEqual({});
  });

  it("lifts only the missing subset", () => {
    const patch = liftProviderProfileFields({
      ratingAvg: 4.9,
      providerProfile: { rating: 3.0, reviewCount: 7, hourlyRate: 50 },
    });
    expect(patch).toEqual({ reviewCount: 7, hourlyRate: 50 });
  });
});

describe("nearestCity", () => {
  const cities = [
    { name: "Milano", lat: 45.4642, lng: 9.19 },
    { name: "Roma", lat: 41.9028, lng: 12.4964 },
    { name: "Napoli", lat: 40.8518, lng: 14.2681 },
  ];

  it("returns the closest city name for a point near Roma", () => {
    expect(nearestCity({ latitude: 41.9, longitude: 12.5 }, cities)).toBe("Roma");
  });

  it("returns the closest city name for a point near Milano", () => {
    expect(nearestCity({ latitude: 45.46, longitude: 9.2 }, cities)).toBe("Milano");
  });

  it("returns null for a null geo point", () => {
    expect(nearestCity(null, cities)).toBeNull();
  });
});
