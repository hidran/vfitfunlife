/**
 * Guess a profession id from a specialty label. **Demo-seed use only.**
 *
 * This used to live in ai/catalog.ts and bridge two taxonomies for search, which is the
 * job the service taxonomy now does properly via `categoryIds`. It survives here because
 * the demo seeder still needs to stamp a plausible `userType` on generated providers, and
 * inventing one at the call site would be worse.
 *
 * Two ids it previously returned — `pilates_instructor` and `dance_instructor` — have no
 * document in the `userTypes` collection, so providers backfilled through it got a
 * profession that could not be resolved. Every id below exists.
 *
 * Do not reintroduce this into a search path.
 */
const REAL_USER_TYPES = [
  "personal_trainer",
  "yoga_teacher",
  "nutritionist",
  "dietitian",
  "physical_therapist",
  "psychologist",
  "massage_therapist",
  "life_coach",
  "hairstylist",
  "pronunciation_coach",
] as const;

export type SeedUserType = (typeof REAL_USER_TYPES)[number];

export function userTypeForSpecialty(specialty: string): SeedUserType {
  const s = specialty.toLowerCase();
  if (s.includes("yoga")) return "yoga_teacher";
  if (s.includes("nutriz") || s.includes("nutrit")) return "nutritionist";
  if (s.includes("dietis") || s.includes("dietit")) return "dietitian";
  if (s.includes("psicolog") || s.includes("psychol")) return "psychologist";
  if (s.includes("mental") || s.includes("coach")) return "life_coach";
  if (s.includes("fisioter") || s.includes("physio")) return "physical_therapist";
  // Osteopathy and massage both land on the manual-therapy profession; there is no
  // osteopath userType, and guessing physical_therapist would imply a licence they may
  // not hold.
  if (s.includes("massag") || s.includes("osteopat")) return "massage_therapist";
  return "personal_trainer";
}

export { REAL_USER_TYPES };
