/**
 * Pure service construction for the demo seeder.
 *
 * Split out of seedData.ts for the same reason lowestPrice and deriveCategories are split
 * out of their triggers: seedData.ts calls getFirestore() at module scope, so nothing in
 * it can be loaded by a test. Everything here is deterministic given an injected random
 * source, so the interesting part — which categories a seeded provider ends up in — is
 * testable without an emulator.
 *
 * The specialty labels below are EXACTLY the Italian leaf labels in
 * ../categories/tree.ts, which is what lets a specialty resolve to a category id by
 * lookup rather than by guesswork. Adding a specialty that has no leaf is a build-time
 * mistake that `categoryIdForSpecialty` turns into a loud failure.
 */

import { buildLabelIndex, foldLabel, SERVICE_CATEGORY_TREE } from "../categories/tree";

export const FITNESS_SPECIALTIES = [
  "Personal Training", "Yoga", "Pilates", "HIIT", "CrossFit",
  "Functional Training", "Strength Training", "Cardio", "Boxe", "Nutrizione",
];

export const WELLNESS_SPECIALTIES = [
  "Massaggio", "Fisioterapia", "Osteopatia", "Mental Coaching",
  "Psicologia", "Nutrizione", "Yoga Therapy",
];

/** Every specialty the seeder generates trainers for — "Nutrizione" sits in both pools. */
export const DEMO_SPECIALTIES = [...new Set([...FITNESS_SPECIALTIES, ...WELLNESS_SPECIALTIES])];

/** One entry of the per-specialty service-name library held in seedData.ts. */
export interface SpecialtyServiceDef {
  name: string;
  description: string;
}

/** A service document body, ready to be written to instructors/{id}/services/{svcId}. */
export interface DemoService {
  svcId: string;
  name: string;
  description: string;
  categoryId: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}

const labelIndex = buildLabelIndex();

/**
 * The leaf category id for a specialty label.
 *
 * Throws rather than returning null: a seeded service with no categoryId is invisible to
 * category browsing and nothing downstream notices, which is exactly how staging ended up
 * with 965 uncategorised services. Failing the seed is the cheaper outcome.
 */
export function categoryIdForSpecialty(specialty: string): string {
  const id = labelIndex.get(foldLabel(specialty));
  if (!id) {
    throw new Error(
      `Demo seed: specialty "${specialty}" has no category in SERVICE_CATEGORY_TREE. ` +
      "Add the leaf to the taxonomy or rename the specialty to match its Italian label.",
    );
  }
  if (!SERVICE_CATEGORY_TREE[id]?.parentId) {
    throw new Error(
      `Demo seed: specialty "${specialty}" resolved to "${id}", which is a root group, ` +
      "not a bookable leaf. Services must carry a leaf category id.",
    );
  }
  return id;
}

/** Resolves every specialty up front, so a bad label fails before anything is written. */
export function specialtyCategoryIds(specialties: string[]): Map<string, string> {
  return new Map(specialties.map((s) => [s, categoryIdForSpecialty(s)]));
}

/** Pre-flight for the seeder: throws before the first write if any specialty is orphaned. */
export function assertDemoSpecialtiesResolve(): void {
  specialtyCategoryIds(DEMO_SPECIALTIES);
}

/** Random source, injected so tests get a fixed provider instead of a sampled one. */
export type RandomSource = () => number;

const intBetween = (random: RandomSource, min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;

/** Fisher-Yates, so the draw is a real permutation rather than a sort with a random comparator. */
function shuffled<T>(items: T[], random: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BuildServicesOptions {
  /** [primary, ...secondaries]. The order decides which specialty is served first. */
  specialties: string[];
  /** Per-specialty name/description pairs; seedData.ts owns the copy. */
  library: Record<string, SpecialtyServiceDef[]>;
  /** Used for a specialty the library has no entry for. */
  fallback: (specialty: string) => SpecialtyServiceDef[];
  random?: RandomSource;
  minServices?: number;
  maxServices?: number;
}

/**
 * Builds a provider's services, spread across ALL of its specialties.
 *
 * Round-robin rather than "n from the primary": a trainer whose specialties are Boxe and
 * Yoga should be findable under both `combat` and `mind_body`, and drawing only from the
 * primary is what made every seeded provider a single-category one. The first pass takes
 * one service per specialty, so with a target of at least `specialties.length` every
 * specialty is represented.
 *
 * Names are de-duplicated across the whole provider — two specialties can share a service
 * name ("Strength & Conditioning" appears under CrossFit), and a provider listing the same
 * service twice reads as a bug to anyone looking at the demo.
 */
export function buildProviderServices(options: BuildServicesOptions): DemoService[] {
  const { specialties, library, fallback } = options;
  const random = options.random ?? Math.random;
  const min = options.minServices ?? 3;
  const max = options.maxServices ?? 5;

  const distinct = [...new Set(specialties)];
  const queues = distinct.map((specialty) => ({
    categoryId: categoryIdForSpecialty(specialty),
    defs: shuffled(library[specialty] ?? fallback(specialty), random),
  }));

  const available = queues.reduce((sum, q) => sum + q.defs.length, 0);
  // At least one per specialty, so the spread the caller asked for actually happens.
  const target = Math.min(Math.max(intBetween(random, min, max), distinct.length), available);

  const services: DemoService[] = [];
  const takenNames = new Set<string>();
  const cursors = queues.map(() => 0);

  // Round-robin over the specialties until the target is met or every queue is drained.
  for (let round = 0; services.length < target; round++) {
    let progressed = false;
    for (let q = 0; q < queues.length && services.length < target; q++) {
      const queue = queues[q];
      while (cursors[q] < queue.defs.length) {
        const def = queue.defs[cursors[q]++];
        const key = foldLabel(def.name);
        if (takenNames.has(key)) continue;
        takenNames.add(key);
        services.push({
          svcId: `svc-${services.length + 1}`,
          name: def.name,
          description: def.description,
          categoryId: queue.categoryId,
          durationMinutes: [30, 45, 60, 90][intBetween(random, 0, 3)],
          price: Math.round(intBetween(random, 30, 120) / 5) * 5,
          isActive: true,
        });
        progressed = true;
        break;
      }
    }
    // Every remaining candidate was a duplicate name; another round would spin forever.
    if (!progressed) break;
  }

  return services;
}
