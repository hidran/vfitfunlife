import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase-admin firestore with an in-memory provider set.
// Defined via vi.hoisted so it is available inside the hoisted vi.mock factory.
const PROVIDERS = vi.hoisted(() => [
  {
    id: "p1",
    fullName: "Mario Rossi",
    role: "provider",
    isVerified: true,
    providerProfile: {
      isVerified: true,
      specialties: ["Personal Training"],
      hourlyRate: 40,
      serviceArea: { city: "Torino" },
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isAvailable: true }],
    },
  },
  {
    id: "p2",
    fullName: "Lucia Bianchi",
    role: "provider",
    isVerified: true,
    providerProfile: {
      isVerified: true,
      specialties: ["Yoga"],
      hourlyRate: 30,
      serviceArea: { city: "Milano" },
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00", isAvailable: true }],
    },
  },
]);

vi.mock("firebase-admin", () => {
  const docs = PROVIDERS.map((p) => ({ id: p.id, data: () => p }));
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs }),
  };
  return {
    firestore: () => ({ collection: () => query }),
  };
});

import { createAiTools } from "./index";

describe("searchProviders tool", () => {
  let tools: ReturnType<typeof createAiTools>;
  beforeEach(() => { tools = createAiTools(); });

  it("returns Torino personal trainers available Monday 15:00-17:00 as cards", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", specialty: "Personal Training", dayOfWeek: 1, startTime: "15:00", endTime: "17:00" },
      { toolCallId: "t", messages: [] } as any,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("p1");
    expect(cards[0].matchingSlots).toEqual(["Mon 14:00–18:00"]);
    expect(cards[0].bookingHref).toBe("/book?providerId=p1");
  });

  it("excludes providers in other cities", async () => {
    const cards = await tools.searchProviders.execute(
      { city: "Torino", dayOfWeek: 1 },
      { toolCallId: "t", messages: [] } as any,
    );
    expect(cards.map((c) => c.id)).not.toContain("p2");
  });
});
