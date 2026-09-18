/**
 * Gamification helpers — pure functions only.
 *
 * XP measures progression (separate from points/VToken which is the reward
 * currency). Levels are derived from XP and denormalized onto the user doc by
 * the Cloud Functions layer. This module contains no side effects and no Firebase
 * imports so it can be unit-tested in isolation.
 */

/**
 * XP earned when a booking is completed (sessione svolta).
 * Base reward: 50 XP per completed booking.
 */
export function xpForBooking(): number {
  return 50;
}

/**
 * XP earned when a review is submitted for a completed booking.
 * Base reward: 10 XP per verified review.
 */
export function xpForReview(): number {
  return 10;
}

/**
 * XP earned when a referred friend completes their first booking.
 * Base reward: 100 XP per activated referral.
 */
export function xpForReferral(): number {
  return 100;
}

/**
 * XP earned when a challenge is completed.
 * Varies by challenge type; falls back to 100 XP.
 */
export function xpForChallenge(
  challengeType: string,
  targetValue: number,
): number {
  switch (challengeType) {
    case 'streak':
      return 150;
    case 'total_classes':
      return Math.min(200, 50 + targetValue);
    case 'try_new':
      return 100;
    case 'referral':
      return 100;
    case 'spend':
      return Math.min(250, Math.floor(targetValue / 10));
    default:
      return 100;
  }
}

/**
 * Points earned alongside XP for each activity.
 * Points = reward currency (VToken in the vision doc); XP = progression measure.
 */
export function pointsForBooking(): number {
  return 50;
}

export function pointsForReview(): number {
  return 10;
}

export function pointsForReferral(): number {
  return 100;
}

export function pointsForChallenge(
  challengeType: string,
  targetValue: number,
): number {
  switch (challengeType) {
    case 'streak':
      return 150;
    case 'total_classes':
      return Math.min(200, 50 + targetValue);
    case 'try_new':
      return 100;
    case 'referral':
      return 100;
    case 'spend':
      return Math.min(250, Math.floor(targetValue / 10));
    default:
      return 100;
  }
}

/**
 * Convert XP to level using tiered thresholds:
 *   Level 1:   0   – 399 XP   (threshold 0)
 *   Level 2: 400   – 899 XP   (threshold 400 = 100*2^2)
 *   Level 3: 900 – 1599 XP   (threshold 900 = 100*3^2)
 *   Level 4: 1600 – 2499 XP  (threshold 1600 = 100*4^2)
 *   Level 5: 2500+ XP        (threshold 2500 = 100*5^2)
 *
 * In general: level N (N>=1) starts at threshold 100*N^2, except level 1
 * which starts at 0. Equivalently: the largest N >= 1 such that
 *   (N === 1 ? 0 : 100*N^2) <= xp.
 *
 * Derivation: for xp >= 400, N = floor(sqrt(xp/100)).
 * For xp in [0,399], level = 1.
 */
export function computeLevel(xp: number): number {
  if (xp < 0) xp = 0;
  if (xp < 400) return 1;
  return Math.floor(Math.sqrt(xp / 100));
}

/**
 * XP required to reach the next level.
 *   xpToNextLevel = thresholdForLevel(level+1) - xp
 */
export function xpToNextLevel(xp: number): number {
  const level = computeLevel(xp);
  const thresholdForNext = xpForLevel(level + 1);
  return Math.max(0, thresholdForNext - xp);
}

/**
 * Minimum XP for a given level (inclusive lower bound).
 *   Level 1: 0
 *   Level N (N>=2): 100 * N^2
 */
export function xpForLevel(level: number): number {
  if (level < 1) level = 1;
  if (level === 1) return 0;
  return 100 * level * level;
}

/**
 * Percentage progress toward next level (0–100).
 */
export function progressToNextLevel(xp: number): number {
  const level = computeLevel(xp);
  const currentThreshold = xpForLevel(level);
  const nextThreshold = xpForLevel(level + 1);
  if (nextThreshold === currentThreshold) return 100;
  return Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100);
}

/**
 * Apply a delta of XP to a user object (in-place, mutates the object).
 * Recomputes level and xpToNextLevel from the new XP total.
 *
 * Used by Cloud Functions when awarding XP; the resulting object is then written
 * back to Firestore. Client code should never call this directly — it is exported
 * for testability of the denormalization logic.
 */
export function applyXpDelta(
  user: {
    xp?: number;
    level?: number;
    xpToNextLevel?: number;
  },
  delta: number,
): {
  xp: number;
  level: number;
  xpToNextLevel: number;
} {
  const newXp = Math.max(0, (user.xp ?? 0) + delta);
  const level = computeLevel(newXp);
  const xpToNext = xpToNextLevel(newXp);
  return { xp: newXp, level, xpToNextLevel: xpToNext };
}

/**
 * Default gamification fields to seed on a user document when no gamification
 * data exists yet (e.g., existing users after deploy, or newly registered users
 * whose profile was created before this feature).
 */
export const DEFAULT_GAMIFICATION = {
  xp: 0,
  level: 1,
  xpToNextLevel: xpToNextLevel(0),
  dayStreak: 0,
  lastCheckInAt: null as unknown as null,
  hasClaimedProfileComplete: false,
  hasClaimedInterests: false,
  hasClaimedZone: false,
  hasClaimedFamily: false,
  interests: [] as string[],
  homeCity: null as string | null,
} as const;

/**
 * Season 0 reward schedule (XP, points).
 * These mirror the vision doc §4 table.
 */
export const SEASON0_REWARDS = {
  signup: { xp: 100, points: 100 },
  profileComplete: { xp: 150, points: 150 },
  interests: { xp: 100, points: 100 },
  zone: { xp: 50, points: 50 },
  family: { xp: 300, points: 300 },
  inviteFriend: { xp: 200, points: 200 },
  friendActive: { xp: 300, points: 300 },
} as const;

/**
 * Check-in reward for the current streak day.
 * Returns { xp, points, isMilestone } where isMilestone is true on days 7/14/30/60/90.
 */
export function checkInReward(dayStreak: number): {
  xp: number;
  points: number;
  isMilestone: boolean;
} {
  const milestones = new Set([7, 14, 30, 60, 90]);
  const isMilestone = milestones.has(dayStreak);

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
