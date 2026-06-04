import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase-admin firestore with an in-memory instructors catalog.
// Defined via vi.hoisted so it is available inside the hoisted vi.mock factory.
const INSTRUCTORS = vi.hoisted(() => [
  {
    id: "i1",
    fullName: "Mario Rossi",
    userType: "personal_trainer",
    city: "Torino",
    specialties: ["Personal Training"],
    languages: ["it", "en"],
    ratingAvg: 4.8,
    reviewCount: 22,
    hourlyRate: 40,
    isVerified: true,
    isActive: true,
    availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
  },
  {
    id: "i2",
    fullName: "Lucia Bianchi",
    userType: "yoga_teacher",
    city: "Milano",
    specialties: ["Yoga"],
    languages: ["it"],
    ratingAvg: 4.5,
    reviewCount: 10,
    hourlyRate: 30,
    isVerified: true,
    isActive: true,
    availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00", isAvailable: true }],
  },
  {
    // No availability data at all -> best-effort include when no time filter.
    id: "i3",
    fullName: "Giulia Verdi",
    userType: "personal_trainer",
    city: "Torino",
    specialties: ["Personal Training"],
    languages: ["it"],
    ratingAvg: 4.2,
    reviewCount: 5,
    hourlyRate: 35,
    isVerified: true,
    isActive: true,
  },
  {
    // Not verified -> must be excluded by the in-loop guard.
    id: "i4",
    fullName: "Hidden Trainer",
    userType: "personal_trainer",
    city: "Torino",
    specialties: ["Personal Training"],
    languages: ["it"],
    hourlyRate: 20,
    isVerified: false,
    isActive: true,
    availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
  },
  {
    // Inactive -> must be excluded by the in-loop guard.
    id: "i5",
    fullName: "Inactive Trainer",
    userType: "personal_trainer",
    city: "Torino",
    specialties: ["Personal Training"],
    languages: ["it"],
    hourlyRate: 20,
    isVerified: true,
    isActive: false,
    availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
  },
  {
    // VFun activity doc sharing the instructors collection. Even with verified
    // + active flags set, it must never surface as a provider.
    id: "i6",
    fullName: "Summer Beach Party",
    activityKind: "event",
    userType: "personal_trainer",
    city: "Torino",
    specialties: ["Personal Training"],
    languages: ["it"],
    hourlyRate: 25,
    isVerified: true,
    isActive: true,
    availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
  },
]);

vi.mock("firebase-admin", () => {
  const docs = INSTRUCTORS.map((p) => ({ id: p.id, data: () => p }));
  // Passthrough query: the real where("isVerified"...) is a no-op in the mock,
  // so the in-loop verified/active guard is what we actually assert against.
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs }),
  };
  const docRef = (id: string) => ({
    get: async () => {
      const found = INSTRUCTORS.find((p) => p.id === id);
      return { exists: !!found, data: () => found };
    },
  });
  return {
    firestore: () => ({
      collection: () => ({ ...query, doc: (id: string) => docRef(id) }),
    }),
  };
});

import { createAiTools } from "./index";

describe("searchProviders tool", () => {
  let tools: ReturnType<typeof createAiTools>;
  beforeEach(() => { tools = createAiTools(); });

  const ctx = { toolCallId: "t", messages: [] } as any;

  it("returns Torino personal trainers available Monday 15:00-17:00 as cards with matchingSlots", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", specialty: "Personal Training", dayOfWeek: 1, startTime: "15:00", endTime: "17:00" },
      ctx,
    );
    // i1 covers Mon 14:00-18:00 (so it gets matchingSlots). i3 has NO
    // availability data, so per the best-effort rule it is still included but
    // without matchingSlots. i2 (Milano) / i4 (unverified) / i5 (inactive) are out.
    const i1 = cards.find((c) => c.id === "i1")!;
    expect(i1).toBeDefined();
    expect(i1.kind).toBe("instructor");
    expect(i1.matchingSlots).toEqual(["Mon 14:00–18:00"]);
    expect(i1.bookingHref).toBe("/book?providerId=i1");

    const i3 = cards.find((c) => c.id === "i3")!;
    expect(i3).toBeDefined();
    expect(i3.matchingSlots).toBeUndefined(); // best-effort: no availability data

    const ids = cards.map((c) => c.id);
    expect(ids).not.toContain("i2");
    expect(ids).not.toContain("i4");
    expect(ids).not.toContain("i5");
  });

  it("excludes instructors in other cities (Milano)", async () => {
    const cards = await tools.searchProviders.execute({ city: "Torino", dayOfWeek: 1 }, ctx);
    expect(cards.map((c) => c.id)).not.toContain("i2");
  });

  it("still returns an instructor with NO availability data when only city/specialty given", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", specialty: "Personal Training" },
      ctx,
    );
    const ids = cards.map((c) => c.id);
    expect(ids).toContain("i3");
    // best-effort: no matchingSlots when there's no availability data
    const i3 = cards.find((c) => c.id === "i3")!;
    expect(i3.matchingSlots).toBeUndefined();
  });

  it("excludes non-verified and inactive instructors via the in-loop guard", async () => {
    const cards = await tools.searchProviders.execute({ city: "Torino", specialty: "Personal Training" }, ctx);
    const ids = cards.map((c) => c.id);
    expect(ids).not.toContain("i4"); // isVerified:false
    expect(ids).not.toContain("i5"); // isActive:false
  });

  it("excludes activity docs (activityKind set) even when verified+active", async () => {
    const cards = await tools.searchProviders.execute({ city: "Torino", specialty: "Personal Training" }, ctx);
    expect(cards.map((c) => c.id)).not.toContain("i6");
  });

  it("filters by priceMax against hourlyRate", async () => {
    const cards = await tools.searchProviders.execute({ city: "Torino", priceMax: 36 }, ctx);
    const ids = cards.map((c) => c.id);
    expect(ids).toContain("i3"); // 35 <= 36
    expect(ids).not.toContain("i1"); // 40 > 36
  });
});

describe("getProviderAvailability tool", () => {
  const tools = createAiTools();
  const ctx = { toolCallId: "t", messages: [] } as any;

  it("returns normalized slots for an existing instructor", async () => {
    const res = await tools.getProviderAvailability.execute({ providerId: "i1" }, ctx);
    expect(res).toEqual({ slots: ["Mon 14:00–18:00"] });
  });

  it("returns provider_not_found for a missing instructor", async () => {
    const res = await tools.getProviderAvailability.execute({ providerId: "nope" }, ctx);
    expect(res).toEqual({ slots: [], error: "provider_not_found" });
  });
});
