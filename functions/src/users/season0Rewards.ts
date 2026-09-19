import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { awardXp } from "./gamification";

const region = process.env.FIREBASE_REGION || "europe-west1";
const db = admin.firestore();

// Reward amounts mirror src/lib/gamification.ts SEASON0_REWARDS (kept in sync).
const REWARDS = {
  profileComplete: { xp: 150, points: 150 },
  interests: { xp: 100, points: 100 },
  zone: { xp: 50, points: 50 },
  family: { xp: 300, points: 300 },
} as const;

async function claimReward(
  userId: string,
  guardField: "hasClaimedProfileComplete" | "hasClaimedInterests" | "hasClaimedZone" | "hasClaimedFamily",
  reward: { xp: number; points: number },
  description: string,
): Promise<{ claimed: boolean; xp: number; points: number; pointsBalance: number }> {
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found");
  }

  const data = snap.data() ?? {};

  if (data[guardField] === true) {
    // Already claimed — idempotent no-op.
    const balance = typeof data.pointsBalance === "number" ? data.pointsBalance : 0;
    return {
      claimed: false,
      xp: 0,
      points: 0,
      pointsBalance: balance,
    };
  }

  await awardXp(userId, reward.xp, `season0_${guardField}`, description);

  await userRef.update({
    [guardField]: true,
    pointsBalance: admin.firestore.FieldValue.increment(reward.points),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const afterSnap = await userRef.get();
  const balanceAfter = (afterSnap.data()?.pointsBalance || 0);

  await db.collection("users").doc(userId).collection("pointsTransactions").add({
    points: reward.points,
    type: "earned",
    source: "promotion",
    sourceId: `season0_${guardField}`,
    description,
    balanceAfter,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    claimed: true,
    xp: reward.xp,
    points: reward.points,
    pointsBalance: balanceAfter,
  };
}

/**
 * Claim the profile-complete reward (+150 XP, +150 points).
 * One-time, guarded by hasClaimedProfileComplete.
 */
export const claimProfileCompleteReward = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    return claimReward(
      request.auth.uid,
      "hasClaimedProfileComplete",
      REWARDS.profileComplete,
      "Profilo completo — reward Season 0",
    );
  },
);

/**
 * Claim the interests reward (+100 XP, +100 points).
 * One-time, guarded by hasClaimedInterests. Client should verify interests
 * count >= 3 before calling.
 */
export const claimInterestsReward = onCall(
  { region },
  async (request: CallableRequest<{ interestsCount?: number }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const count = request.data.interestsCount;
    if (count !== undefined && count < 3) {
      throw new HttpsError("invalid-argument", "Scegli almeno 3 interessi per claimare il reward");
    }
    const userRef = db.collection("users").doc(request.auth.uid);
    const snap = await userRef.get();
    const interests = Array.isArray(snap.data()?.interests) ? snap.data()!.interests : [];
    if (interests.length < 3) {
      throw new HttpsError("failed-precondition", "Imposta almeno 3 interessi prima di claimare il reward");
    }
    return claimReward(
      request.auth.uid,
      "hasClaimedInterests",
      REWARDS.interests,
      `Interessi completati (${interests.length} scelti) — reward Season 0`,
    );
  },
);

/**
 * Claim the zone/city reward (+50 XP, +50 points).
 * One-time, guarded by hasClaimedZone.
 */
export const claimZoneReward = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const userRef = db.collection("users").doc(request.auth.uid);
    const snap = await userRef.get();
    const homeCity = snap.data()?.homeCity;
    if (!homeCity || typeof homeCity !== "string" || homeCity.trim() === "") {
      throw new HttpsError("failed-precondition", "Imposta la tua città/zona prima di claimare il reward");
    }
    return claimReward(
      request.auth.uid,
      "hasClaimedZone",
      REWARDS.zone,
      `Zona ${homeCity} impostata — reward Season 0`,
    );
  },
);

/**
 * Claim the family reward (+300 XP, +300 points).
 * One-time, guarded by hasClaimedFamily. Client should verify familyId is set.
 */
export const claimFamilyReward = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const userRef = db.collection("users").doc(request.auth.uid);
    const snap = await userRef.get();
    const familyId = snap.data()?.familyId;
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("failed-precondition", "Crea o entra in una famiglia prima di claimare il reward");
    }
    return claimReward(
      request.auth.uid,
      "hasClaimedFamily",
      REWARDS.family,
      `Famiglia ${familyId} — reward Season 0`,
    );
  },
);
