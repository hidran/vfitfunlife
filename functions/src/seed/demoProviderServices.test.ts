import { describe, it, expect } from "vitest";
import {
  buildProviderServices,
  categoryIdForSpecialty,
  DEMO_SPECIALTIES,
  FITNESS_SPECIALTIES,
  WELLNESS_SPECIALTIES,
  specialtyCategoryIds,
  type SpecialtyServiceDef,
} from "./demoProviderServices";
import { SERVICE_CATEGORY_TREE } from "../categories/tree";
import { activeCategoryIds } from "../providers/deriveCategories";

/** Deterministic stand-in for Math.random, so a built provider is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const library: Record<string, SpecialtyServiceDef[]> = {
  "Boxe": [
    { name: "Boxe tecnica 1-to-1", description: "Fondamentali." },
    { name: "Boxe fitness", description: "Senza sparring." },
    { name: "Pacchetto 8 lezioni boxe", description: "Ciclo intensivo." },
  ],
  "Yoga": [
    { name: "Lezione Yoga individuale", description: "Personalizzata." },
    { name: "Yoga Nidra", description: "Rilassamento profondo." },
    { name: "Morning Flow", description: "Sequenza energizzante." },
  ],
  "Massaggio": [
    { name: "Massaggio rilassante", description: "Decontratturante." },
    { name: "Massaggio sportivo", description: "Pre/post gara." },
  ],
};

const fallback = (specialty: string): SpecialtyServiceDef[] => [
  { name: `Sessione ${specialty}`, description: `Sessione di ${specialty}.` },
  { name: `Consulenza ${specialty}`, description: "Primo incontro." },
];

describe("categoryIdForSpecialty", () => {
  it("resolves every demo specialty to a leaf category", () => {
    // The whole point of the taxonomy's Italian labels: no seeded service is uncategorised.
    for (const specialty of DEMO_SPECIALTIES) {
      const id = categoryIdForSpecialty(specialty);
      expect(SERVICE_CATEGORY_TREE[id], `${specialty} -> ${id}`).toBeDefined();
      expect(SERVICE_CATEGORY_TREE[id].parentId, `${specialty} -> ${id} must be a leaf`).not.toBeNull();
    }
  });

  it("covers both pools, with Nutrizione shared between them", () => {
    expect(DEMO_SPECIALTIES).toHaveLength(16);
    expect(FITNESS_SPECIALTIES.length + WELLNESS_SPECIALTIES.length).toBe(17);
    expect(categoryIdForSpecialty("Nutrizione")).toBe("nutrition");
  });

  it("maps the labels that are not their own id", () => {
    expect(categoryIdForSpecialty("Boxe")).toBe("boxing");
    expect(categoryIdForSpecialty("Fisioterapia")).toBe("physio");
    expect(categoryIdForSpecialty("Osteopatia")).toBe("osteopathy");
    expect(categoryIdForSpecialty("Massaggio")).toBe("massage");
    expect(categoryIdForSpecialty("Psicologia")).toBe("psychology");
  });

  it("throws on an unknown specialty rather than writing an uncategorised service", () => {
    expect(() => categoryIdForSpecialty("Kitesurf")).toThrow(/no category/);
  });

  it("throws when a label resolves to a root group instead of a bookable leaf", () => {
    expect(() => categoryIdForSpecialty("Mente e Corpo")).toThrow(/root group/);
  });

  it("resolves the whole set up front, so a bad label fails before any write", () => {
    expect(specialtyCategoryIds(DEMO_SPECIALTIES).size).toBe(16);
    expect(() => specialtyCategoryIds([...DEMO_SPECIALTIES, "Kitesurf"])).toThrow();
  });
});

describe("buildProviderServices", () => {
  it("spreads a provider's services across its own specialties, not just the primary", () => {
    const services = buildProviderServices({
      specialties: ["Boxe", "Yoga"],
      library,
      fallback,
      random: lcg(7),
    });

    const categories = new Set(services.map((s) => s.categoryId));
    expect(categories.size).toBeGreaterThan(1);
    expect(categories).toContain("boxing");
    expect(categories).toContain("yoga");
  });

  it("produces categoryIds carrying every leaf and its ancestors", () => {
    const services = buildProviderServices({
      specialties: ["Boxe", "Yoga"],
      library,
      fallback,
      random: lcg(7),
    });

    // What the seed writes onto the instructor doc, and the array-contains search key.
    expect(activeCategoryIds(services)).toEqual(["boxing", "combat", "mind_body", "yoga"]);
  });

  it("reaches several root categories when the secondary is from another branch", () => {
    const services = buildProviderServices({
      specialties: ["Yoga", "Massaggio"],
      library,
      fallback,
      random: lcg(42),
    });

    expect(activeCategoryIds(services)).toEqual(["massage", "mind_body", "therapy_recovery", "yoga"]);
  });

  it("gives every specialty at least one service", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const services = buildProviderServices({
        specialties: ["Boxe", "Yoga", "Massaggio"],
        library,
        fallback,
        random: lcg(seed),
      });
      const categories = new Set(services.map((s) => s.categoryId));
      expect(categories, `seed ${seed}`).toEqual(new Set(["boxing", "yoga", "massage"]));
    }
  });

  it("never gives a provider the same service twice", () => {
    const shared: Record<string, SpecialtyServiceDef[]> = {
      "CrossFit": [{ name: "Strength & Conditioning", description: "Forza." }],
      "Strength Training": [
        { name: "Strength & Conditioning", description: "Forza, di nuovo." },
        { name: "Forza 1-to-1", description: "Programmazione." },
      ],
    };
    const services = buildProviderServices({
      specialties: ["CrossFit", "Strength Training"],
      library: shared,
      fallback,
      random: lcg(3),
    });

    const names = services.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("numbers services from svc-1 with no gaps, so a re-seed overwrites in place", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const services = buildProviderServices({
        specialties: ["Boxe", "Yoga"],
        library,
        fallback,
        random: lcg(seed),
      });
      expect(services.map((s) => s.svcId)).toEqual(
        services.map((_, i) => `svc-${i + 1}`),
      );
    }
  });

  it("keeps the volume in the requested band and never exceeds what the library holds", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const services = buildProviderServices({
        specialties: ["Boxe", "Yoga"],
        library,
        fallback,
        random: lcg(seed),
      });
      expect(services.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(services.length, `seed ${seed}`).toBeLessThanOrEqual(5);
    }

    // Two specialties of one definition each cannot yield three services.
    const thin = buildProviderServices({
      specialties: ["Boxe", "Yoga"],
      library: {
        "Boxe": [{ name: "Boxe fitness", description: "." }],
        "Yoga": [{ name: "Yoga Nidra", description: "." }],
      },
      fallback,
      random: lcg(9),
    });
    expect(thin).toHaveLength(2);
  });

  it("randomises price and duration within the seeder's bands", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const services = buildProviderServices({
        specialties: ["Boxe", "Yoga"],
        library,
        fallback,
        random: lcg(seed),
      });
      for (const s of services) {
        expect([30, 45, 60, 90]).toContain(s.durationMinutes);
        expect(s.price).toBeGreaterThanOrEqual(30);
        expect(s.price).toBeLessThanOrEqual(120);
        expect(s.price % 5).toBe(0);
        expect(s.isActive).toBe(true);
      }
    }
  });

  it("falls back to generated copy for a specialty the library does not cover", () => {
    const services = buildProviderServices({
      specialties: ["Nutrizione"],
      library: {},
      fallback,
      random: lcg(11),
    });
    expect(services.every((s) => s.categoryId === "nutrition")).toBe(true);
    expect(services.every((s) => s.name.includes("Nutrizione"))).toBe(true);
  });
});
