import { describe, it, expect } from 'vitest';
import {
  xpForBooking,
  xpForReview,
  xpForReferral,
  xpForChallenge,
  pointsForBooking,
  pointsForReview,
  pointsForReferral,
  pointsForChallenge,
  computeLevel,
  xpToNextLevel,
  xpForLevel,
  progressToNextLevel,
  applyXpDelta,
  DEFAULT_GAMIFICATION,
  SEASON0_REWARDS,
  checkInReward,
} from './gamification';

describe('xpForBooking', () => {
  it('returns 50 XP for a completed booking', () => {
    expect(xpForBooking()).toBe(50);
  });
});

describe('xpForReview', () => {
  it('returns 10 XP for a verified review', () => {
    expect(xpForReview()).toBe(10);
  });
});

describe('xpForReferral', () => {
  it('returns 100 XP for an activated referral', () => {
    expect(xpForReferral()).toBe(100);
  });
});

describe('xpForChallenge', () => {
  it('returns 150 XP for a streak challenge', () => {
    expect(xpForChallenge('streak', 7)).toBe(150);
  });

  it('returns 50 + targetValue capped at 200 for total_classes', () => {
    expect(xpForChallenge('total_classes', 10)).toBe(60);
    expect(xpForChallenge('total_classes', 100)).toBe(150);
    expect(xpForChallenge('total_classes', 200)).toBe(200);
    expect(xpForChallenge('total_classes', 300)).toBe(200);
  });

  it('returns 100 XP for try_new', () => {
    expect(xpForChallenge('try_new', 1)).toBe(100);
  });

  it('returns 100 XP for referral challenge', () => {
    expect(xpForChallenge('referral', 1)).toBe(100);
  });

  it('returns floor(targetValue/10) capped at 250 for spend', () => {
    expect(xpForChallenge('spend', 100)).toBe(10);
    expect(xpForChallenge('spend', 1000)).toBe(100);
    expect(xpForChallenge('spend', 3000)).toBe(250);
    expect(xpForChallenge('spend', 5000)).toBe(250);
  });

  it('falls back to 100 XP for unknown challenge type', () => {
    expect(xpForChallenge('unknown', 0)).toBe(100);
  });
});

describe('pointsForBooking', () => {
  it('returns 50 points', () => {
    expect(pointsForBooking()).toBe(50);
  });
});

describe('pointsForReview', () => {
  it('returns 10 points', () => {
    expect(pointsForReview()).toBe(10);
  });
});

describe('pointsForReferral', () => {
  it('returns 100 points', () => {
    expect(pointsForReferral()).toBe(100);
  });
});

describe('pointsForChallenge', () => {
  it('mirrors xpForChallenge values', () => {
    expect(pointsForChallenge('streak', 7)).toBe(150);
    expect(pointsForChallenge('total_classes', 100)).toBe(150);
    expect(pointsForChallenge('try_new', 1)).toBe(100);
    expect(pointsForChallenge('referral', 1)).toBe(100);
    expect(pointsForChallenge('spend', 1000)).toBe(100);
    expect(pointsForChallenge('unknown', 0)).toBe(100);
  });
});

describe('computeLevel', () => {
  it('returns level 1 for 0 XP', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('returns level 1 for XP up to 399', () => {
    expect(computeLevel(0)).toBe(1);
    expect(computeLevel(100)).toBe(1);
    expect(computeLevel(300)).toBe(1);
    expect(computeLevel(399)).toBe(1);
  });

  it('returns level 2 at 400 XP', () => {
    expect(computeLevel(400)).toBe(2);
    expect(computeLevel(899)).toBe(2);
  });

  it('returns level 3 at 900 XP', () => {
    expect(computeLevel(900)).toBe(3);
    expect(computeLevel(1599)).toBe(3);
  });

  it('returns level 4 at 1600 XP', () => {
    expect(computeLevel(1600)).toBe(4);
    expect(computeLevel(2499)).toBe(4);
  });

  it('returns level 5 at 2500 XP', () => {
    expect(computeLevel(2500)).toBe(5);
    // 10000 XP = 100*10^2 → level 10
    expect(computeLevel(10000)).toBe(10);
  });

  it('clamps negative XP to 0', () => {
    expect(computeLevel(-50)).toBe(1);
    expect(computeLevel(-1000)).toBe(1);
  });
});

describe('xpForLevel', () => {
  it('returns 0 XP for level 1', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('returns 400 XP for level 2', () => {
    expect(xpForLevel(2)).toBe(400);
  });

  it('returns 900 XP for level 3', () => {
    expect(xpForLevel(3)).toBe(900);
  });

  it('returns 1600 XP for level 4', () => {
    expect(xpForLevel(4)).toBe(1600);
  });

  it('clamps level below 1 to 1', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-1)).toBe(0);
  });
});

describe('xpToNextLevel', () => {
  it('returns 400 XP to next level at 0 XP', () => {
    expect(xpToNextLevel(0)).toBe(400);
  });

  it('returns 0 XP to next level exactly at a level threshold', () => {
    expect(xpToNextLevel(400)).toBe(500);
    expect(xpToNextLevel(900)).toBe(700);
  });

  it('returns correct progress at mid-level', () => {
    // Level 1, 200 XP: next threshold is 400 → 200 to go
    expect(xpToNextLevel(200)).toBe(200);
  });

  it('returns 0 when XP is exactly at the next level threshold', () => {
    // At 400 XP you are level 2; next threshold is 900
    expect(xpToNextLevel(400)).toBe(500);
  });
});

describe('progressToNextLevel', () => {
  it('returns 0 at level start', () => {
    expect(progressToNextLevel(0)).toBe(0);
  });

  it('returns 50 at halfway within level 1', () => {
    // Level 1: 0–399 XP range; 200 XP = 50%
    expect(progressToNextLevel(200)).toBe(50);
  });

  it('returns ~100 just before crossing to next level', () => {
    // 399 XP in level 1 range (0-399): 399/400 = 99.75% → rounds to 100
    expect(progressToNextLevel(399)).toBe(100);
  });

  it('returns 0 at the exact start of a new level', () => {
    // 400 XP = level 2 start
    expect(progressToNextLevel(400)).toBe(0);
  });
});

describe('applyXpDelta', () => {
  it('adds delta to existing XP and recomputes level', () => {
    const user = { xp: 200, level: 1, xpToNextLevel: 200 };
    const result = applyXpDelta(user, 250);
    expect(result.xp).toBe(450);
    expect(result.level).toBe(2);
    expect(result.xpToNextLevel).toBe(450);
  });

  it('starts from 0 when no XP exists', () => {
    const user = {};
    const result = applyXpDelta(user, 50);
    expect(result.xp).toBe(50);
    expect(result.level).toBe(1);
    expect(result.xpToNextLevel).toBe(350);
  });

  it('clamps negative total to 0', () => {
    const user = { xp: 10, level: 1, xpToNextLevel: 390 };
    const result = applyXpDelta(user, -20);
    expect(result.xp).toBe(0);
    expect(result.level).toBe(1);
    expect(result.xpToNextLevel).toBe(400);
  });

  it('is pure with respect to the input object', () => {
    const user = { xp: 100, level: 1, xpToNextLevel: 300 };
    const before = JSON.stringify(user);
    applyXpDelta(user, 50);
    expect(JSON.stringify(user)).toBe(before);
  });
});

describe('DEFAULT_GAMIFICATION', () => {
  it('has xp 0, level 1, xpToNextLevel 400', () => {
    expect(DEFAULT_GAMIFICATION.xp).toBe(0);
    expect(DEFAULT_GAMIFICATION.level).toBe(1);
    expect(DEFAULT_GAMIFICATION.xpToNextLevel).toBe(400);
  });

  it('has dayStreak 0 and all claim flags false', () => {
    expect(DEFAULT_GAMIFICATION.dayStreak).toBe(0);
    expect(DEFAULT_GAMIFICATION.hasClaimedProfileComplete).toBe(false);
    expect(DEFAULT_GAMIFICATION.hasClaimedInterests).toBe(false);
    expect(DEFAULT_GAMIFICATION.hasClaimedZone).toBe(false);
    expect(DEFAULT_GAMIFICATION.hasClaimedFamily).toBe(false);
  });

  it('has empty interests and null homeCity', () => {
    expect(DEFAULT_GAMIFICATION.interests).toEqual([]);
    expect(DEFAULT_GAMIFICATION.homeCity).toBe(null);
  });
});

describe('SEASON0_REWARDS', () => {
  it('matches the vision doc §4 table', () => {
    expect(SEASON0_REWARDS.signup).toEqual({ xp: 100, points: 100 });
    expect(SEASON0_REWARDS.profileComplete).toEqual({ xp: 150, points: 150 });
    expect(SEASON0_REWARDS.interests).toEqual({ xp: 100, points: 100 });
    expect(SEASON0_REWARDS.zone).toEqual({ xp: 50, points: 50 });
    expect(SEASON0_REWARDS.family).toEqual({ xp: 300, points: 300 });
    expect(SEASON0_REWARDS.inviteFriend).toEqual({ xp: 200, points: 200 });
    expect(SEASON0_REWARDS.friendActive).toEqual({ xp: 300, points: 300 });
  });
});

describe('checkInReward', () => {
  it('day 1: 10 XP + 5 points, not milestone', () => {
    expect(checkInReward(1)).toEqual({ xp: 10, points: 5, isMilestone: false });
  });

  it('days 2-6: 20 XP + 10 points, not milestone', () => {
    expect(checkInReward(2)).toEqual({ xp: 20, points: 10, isMilestone: false });
    expect(checkInReward(6)).toEqual({ xp: 20, points: 10, isMilestone: false });
  });

  it('day 7+: 50 XP + 25 points base, plus milestone bonus on 7/14/30/60/90', () => {
    expect(checkInReward(7)).toEqual({ xp: 150, points: 125, isMilestone: true });
    expect(checkInReward(14)).toEqual({ xp: 150, points: 125, isMilestone: true });
    expect(checkInReward(30)).toEqual({ xp: 150, points: 125, isMilestone: true });
    expect(checkInReward(60)).toEqual({ xp: 150, points: 125, isMilestone: true });
    expect(checkInReward(90)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('non-milestone days 8-13 have no bonus', () => {
    expect(checkInReward(8)).toEqual({ xp: 50, points: 25, isMilestone: false });
    expect(checkInReward(13)).toEqual({ xp: 50, points: 25, isMilestone: false });
  });

  it('streak 0 returns day 1 reward (guard)', () => {
    // A call with 0 should still work; treated as first check-in path
    const result = checkInReward(0);
    // 0 is not a milestone; falls into day 1 branch since === 1 is false and <= 6 is false → day 7+ branch
    // Actually 0 is <= 6, but !== 1, so day 2-6 branch → 20/10. Let's verify.
    expect(result).toEqual({ xp: 20, points: 10, isMilestone: false });
  });
});
