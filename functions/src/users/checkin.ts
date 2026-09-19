import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { awardXp } from "./gamification";

const region = process.env.FIREBASE_REGION || "europe-west1";
const db = admin.firestore();

/**
 * Check-in reward schedule (mirrors src/lib/gamification.ts checkInReward).
 * Kept here so the callable can compute milestone bonuses without importing
 * client code (functions can't import from src/).
 */
const MILESTONES = new Set([7, 14, 30, 60, 90]);

function checkInReward(dayStreak: number): { xp: number; points: number; isMilestone: boolean } {
  const isMilestone = MILESTONES.has(dayStreak);

  let xp: number;
  let points: number;

  if (dayStreak === 1) {
    xp = 10;
    points = 5;
  } else if (dayStreak <= 6) {
    xp = 20;
    points = 10;
  } else {
    xp = 50;
    points = 25;
  }

  if (isMilestone) {
    xp += 100;
    points += 100;
  }

  return { xp, points, isMilestone };
}

/**
 * Daily check-in callable.
 *
 * - Increments streak if last check-in was < 24h ago.
 * - Resets to 1 if the gap is > 24h (new streak starts).
 * - Blocks double check-in on the same calendar day.
 * - Awards XP + points via awardXp + a PointsTransaction ledger entry.
 * - Milestones (7/14/30/60/90): bonus XP + points.
 */
export const checkIn = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const data = snap.data() ?? {};
    const now = admin.firestore.Timestamp.now();
    const lastCheckIn = data.lastCheckInAt as admin.firestore.Timestamp | null | undefined;
    const dayStreak = typeof data.dayStreak === "number" ? data.dayStreak : 0;

    // Same-day guard: block if already checked in today (calendar day, local to server).
    if (lastCheckIn) {
      const lastDate = new Date(lastCheckIn.seconds * 1000);
      const today = new Date(now.seconds * 1000);
      if (
        lastDate.getFullYear() === today.getFullYear() &&
        lastDate.getMonth() === today.getMonth() &&
        lastDate.getDate() === today.getDate()
      ) {
        // Already checked in today — return current state, no-op.
        return {
          checkedIn: false,
          reason: "already_checked_in_today",
          dayStreak,
          lastCheckInAt: lastCheckIn.toDate().toISOString(),
        };
      }

      // Gap > 24h → reset streak to 1 (new streak). Otherwise increment.
      const hoursSinceLast = (now.seconds - lastCheckIn.seconds) / 3600;
      const newStreak = hoursSinceLast > 24 ? 1 : dayStreak + 1;

      const reward = checkInReward(newStreak);
      const xpResult = await awardXp(userId, reward.xp, "checkin", `Check-in giorno ${newStreak}`);

      // Points via transaction ledger.
      const userSnap = await userRef.get();
      const balanceAfter = ((userSnap.data()?.pointsBalance || 0) + reward.points);

      await userRef.update({
        dayStreak: newStreak,
        lastCheckInAt: now,
        pointsBalance: admin.firestore.FieldValue.increment(reward.points),
        updatedAt: now,
      });

      await db.collection("users").doc(userId).collection("pointsTransactions").add({
        points: reward.points,
        type: "earned",
        source: "checkin",
        sourceId: `checkin-${now.toDate().toISOString()}`,
        description: `Check-in giorno ${newStreak}${reward.isMilestone ? " · milestone" : ""}`,
        balanceAfter,
        createdAt: now,
      });

      return {
        checkedIn: true,
        dayStreak: newStreak,
        xpAwarded: reward.xp,
        pointsAwarded: reward.points,
        isMilestone: reward.isMilestone,
        xp: xpResult.xp,
        level: xpResult.level,
        xpToNextLevel: xpResult.xpToNextLevel,
        lastCheckInAt: now.toDate().toISOString(),
      };
    }

    // First-ever check-in → streak = 1.
    const reward = checkInReward(1);
    const xpResult = await awardXp(userId, reward.xp, "checkin", "Primo check-in");

    await userRef.update({
      dayStreak: 1,
      lastCheckInAt: now,
      pointsBalance: admin.firestore.FieldValue.increment(reward.points),
      updatedAt: now,
    });

    const userSnap = await userRef.get();
    const balanceAfter = (userSnap.data()?.pointsBalance || 0);

    await db.collection("users").doc(userId).collection("pointsTransactions").add({
      points: reward.points,
      type: "earned",
      source: "checkin",
      sourceId: `checkin-${now.toDate().toISOString()}`,
      description: "Primo check-in",
      balanceAfter,
      createdAt: now,
    });

    return {
      checkedIn: true,
      dayStreak: 1,
      xpAwarded: reward.xp,
      pointsAwarded: reward.points,
      isMilestone: reward.isMilestone,
      xp: xpResult.xp,
      level: xpResult.level,
      xpToNextLevel: xpResult.xpToNextLevel,
      lastCheckInAt: now.toDate().toISOString(),
    };
  },
);
