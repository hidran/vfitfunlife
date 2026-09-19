import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const region = process.env.FIREBASE_REGION || "europe-west1";

function getDb() {
  return admin.firestore();
}

/**
 * Level and remaining XP for a total. Mirror of computeLevel / xpToNextLevel
 * in src/lib/gamification.ts (functions can't import from src/).
 */
export function levelFromXp(xp: number): { level: number; xpToNextLevel: number } {
  const level = xp < 400 ? 1 : Math.floor(Math.sqrt(xp / 100));
  const xpForLevel = (l: number) => (l <= 1 ? 0 : 100 * l * l);
  return { level, xpToNextLevel: Math.max(0, xpForLevel(level + 1) - xp) };
}

const SEASON0_DEFAULTS: Record<string, unknown> = {
  dayStreak: 0,
  lastCheckInAt: null,
  hasClaimedProfileComplete: false,
  hasClaimedInterests: false,
  hasClaimedZone: false,
  hasClaimedFamily: false,
  interests: [],
  homeCity: null,
  familyId: null,
  familyRole: null,
};

/**
 * The Season 0 fields a user doc lacks, with their defaults. Only absent fields
 * are returned — existing progress (XP, streak, claims, family) is never reset.
 * `null` counts as present.
 */
export function missingSeason0Fields(data: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const xp = typeof data.xp === "number" ? data.xp : 0;
  if (data.xp === undefined) patch.xp = 0;
  const derived = levelFromXp(xp);
  if (data.level === undefined) patch.level = derived.level;
  if (data.xpToNextLevel === undefined) patch.xpToNextLevel = derived.xpToNextLevel;
  for (const [field, value] of Object.entries(SEASON0_DEFAULTS)) {
    if (data[field] === undefined) patch[field] = Array.isArray(value) ? [] : value;
  }
  return patch;
}

/**
 * Apply an XP delta to a user document and write the denormalized level +
 * xpToNextLevel. Server-side only — never called from client code directly.
 *
 * Uses the same formula as src/lib/gamification.ts (mirror, kept in sync).
 * XP only ever increases here; negative deltas are clamped to a no-op.
 */
export async function awardXp(
  userId: string,
  delta: number,
  source: string,
  description: string,
): Promise<{ xp: number; level: number; xpToNextLevel: number }> {
  const db = getDb();
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found");
  }

  const data = snap.data() ?? {};
  const currentXp = typeof data.xp === "number" ? data.xp : 0;
  const newXp = Math.max(0, currentXp + Math.max(0, delta));

  const { level, xpToNextLevel } = levelFromXp(newXp);

  await userRef.update({
    xp: newXp,
    level,
    xpToNextLevel,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Append-only XP ledger (informational; source of truth is user.xp).
  await db.collection("users").doc(userId).collection("xpTransactions").add({
    delta,
    source,
    description,
    xpAfter: newXp,
    levelAfter: level,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { xp: newXp, level, xpToNextLevel };
}

/**
 * Seed default gamification fields on a user document that lacks them.
 *
 * Called by the client after login when the user doc was created before this
 * feature shipped (missing xp/level/xpToNextLevel/dayStreak fields). Safe to
 * call on every profile load: it fills in only the fields that are absent, so
 * a doc that already has some progress keeps it.
 *
 * Only the caller's own user doc can be seeded.
 */
export const seedDefaultSeason0Progress = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const db = getDb();
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const data = userSnap.data() ?? {};

    const patch = missingSeason0Fields(data);

    if (Object.keys(patch).length === 0) {
      return {
        seeded: false,
        xp: data.xp ?? 0,
        level: data.level ?? 1,
        xpToNextLevel: data.xpToNextLevel ?? 400,
        dayStreak: data.dayStreak ?? 0,
      };
    }

    await userRef.update(patch);
    const seeded = { ...data, ...patch };

    return {
      seeded: true,
      xp: seeded.xp,
      level: seeded.level,
      xpToNextLevel: seeded.xpToNextLevel,
      dayStreak: seeded.dayStreak,
    };
  },
);
