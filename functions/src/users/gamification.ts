import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const region = process.env.FIREBASE_REGION || "europe-west1";

function getDb() {
  return admin.firestore();
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

  // Mirror of computeLevel / xpToNextLevel from src/lib/gamification.ts.
  const level =
    newXp < 400 ?
      1 :
      Math.floor(Math.sqrt(newXp / 100));
  const xpForLevel = (l: number) =>
    l <= 1 ? 0 : 100 * l * l;
  const nextThreshold = xpForLevel(level + 1);
  const xpToNextLevel = Math.max(0, nextThreshold - newXp);

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
 * call idempotently — if the fields already exist, it's a no-op.
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

    // Determine whether any gamification field is missing or at default.
    const needsSeed =
      data.xp === undefined ||
      data.level === undefined ||
      data.xpToNextLevel === undefined ||
      data.dayStreak === undefined ||
      data.hasClaimedProfileComplete === undefined ||
      data.hasClaimedInterests === undefined ||
      data.hasClaimedZone === undefined ||
      data.hasClaimedFamily === undefined ||
      data.interests === undefined ||
      data.homeCity === undefined ||
      data.familyId === undefined ||
      data.familyRole === undefined;

    if (!needsSeed) {
      // Already seeded — return current state.
      return {
        seeded: false,
        xp: data.xp ?? 0,
        level: data.level ?? 1,
        xpToNextLevel: data.xpToNextLevel ?? 400,
        dayStreak: data.dayStreak ?? 0,
      };
    }

    const seedData: Record<string, unknown> = {
      xp: 0,
      level: 1,
      xpToNextLevel: 400,
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

    await userRef.update(seedData);

    return {
      seeded: true,
      xp: 0,
      level: 1,
      xpToNextLevel: 400,
      dayStreak: 0,
    };
  },
);
