import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const region = process.env.FIREBASE_REGION || 'europe-west1';

function getDb() {
  return admin.firestore();
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
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const db = getDb();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found');
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
