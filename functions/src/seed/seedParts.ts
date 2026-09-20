/**
 * Which generators the seedDemoData endpoint runs.
 *
 * Separate from seedData.ts so the selection logic is testable — seedData.ts calls
 * getFirestore() at module scope and cannot be imported by a test.
 */

/**
 * The runnable parts, in the order the endpoint runs them.
 *
 * Order is fixed rather than taken from the request: `photos`, `avatars`, `prices` and
 * `coords` all read /instructors and rewrite what they find, so running them before
 * `core` on an empty project would silently do nothing.
 *
 * `generateDemoFunActivities` is deliberately absent — VFun sits behind the pilot flag,
 * and seeding it would put event/VR/party documents into /instructors where the fitness
 * browse would pick them up.
 */
export const DEMO_SEED_PARTS = ["core", "content", "clients", "photos", "avatars", "prices", "coords"] as const;

export type DemoSeedPart = (typeof DEMO_SEED_PARTS)[number];

/**
 * Validates the `parts` body field, returning every part when it is absent.
 *
 * Rejects an unknown name rather than ignoring it: a typo that quietly seeds nothing is
 * indistinguishable from a generator that ran and found no work.
 */
export function resolveSeedParts(raw: unknown): { parts: DemoSeedPart[] } | { error: string } {
  if (raw === undefined || raw === null) return { parts: [...DEMO_SEED_PARTS] };
  if (!Array.isArray(raw)) return { error: "`parts` must be an array of strings" };
  const unknown = raw.filter((p) => !DEMO_SEED_PARTS.includes(p as DemoSeedPart));
  if (unknown.length) {
    return { error: `Unknown parts: ${unknown.join(", ")}. Allowed: ${DEMO_SEED_PARTS.join(", ")}` };
  }
  const selected = new Set(raw as DemoSeedPart[]);
  // Re-derived from the canonical order, so a caller listing "coords" before "core" still
  // gets core first — and a repeated name runs once.
  return { parts: DEMO_SEED_PARTS.filter((p) => selected.has(p)) };
}
