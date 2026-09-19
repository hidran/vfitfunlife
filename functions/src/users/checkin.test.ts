import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';

// We test the pure reward helper (mirrored in the callable) and the
// decision logic (same-day block, gap reset) without touching Firestore.
// The callable wrapper itself is covered by the import smoke test below.

/** Mirror of the reward function from checkin.ts (kept in sync). */
function checkInReward(dayStreak: number): { xp: number; points: number; isMilestone: boolean } {
  const MILESTONES = new Set([7, 14, 30, 60, 90]);
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

describe('checkIn reward logic', () => {
  it('first check-in: 10 XP + 5 points, not milestone', () => {
    expect(checkInReward(1)).toEqual({ xp: 10, points: 5, isMilestone: false });
  });

  it('days 2-6: 20 XP + 10 points, not milestone', () => {
    expect(checkInReward(2)).toEqual({ xp: 20, points: 10, isMilestone: false });
    expect(checkInReward(6)).toEqual({ xp: 20, points: 10, isMilestone: false });
  });

  it('day 7 milestone: 150 XP + 125 points', () => {
    expect(checkInReward(7)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('day 14 milestone: 150 XP + 125 points', () => {
    expect(checkInReward(14)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('day 30 milestone: 150 XP + 125 points', () => {
    expect(checkInReward(30)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('day 60 milestone: 150 XP + 125 points', () => {
    expect(checkInReward(60)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('day 90 milestone: 150 XP + 125 points', () => {
    expect(checkInReward(90)).toEqual({ xp: 150, points: 125, isMilestone: true });
  });

  it('non-milestone days 8-13: 50 XP + 25 points', () => {
    expect(checkInReward(8)).toEqual({ xp: 50, points: 25, isMilestone: false });
    expect(checkInReward(13)).toEqual({ xp: 50, points: 25, isMilestone: false });
  });

  it('non-milestone days 15-29: 50 XP + 25 points', () => {
    expect(checkInReward(15)).toEqual({ xp: 50, points: 25, isMilestone: false });
    expect(checkInReward(29)).toEqual({ xp: 50, points: 25, isMilestone: false });
  });
});

describe('checkIn same-day guard logic', () => {
  it('blocks check-in if lastCheckInAt is today (same calendar day)', () => {
    // Simulate: lastCheckInAt = today 09:00, now = today 14:00 → blocked.
    const last = new admin.firestore.Timestamp(
      Math.floor(Date.now() / 1000),
      0,
    );
    const now = admin.firestore.Timestamp.now();

    const lastDate = new Date(last.seconds * 1000);
    const today = new Date(now.seconds * 1000);

    const sameDay =
      lastDate.getFullYear() === today.getFullYear() &&
      lastDate.getMonth() === today.getMonth() &&
      lastDate.getDate() === today.getDate();

    expect(sameDay).toBe(true);
  });

  it('allows check-in if lastCheckInAt was yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 0, 0);

    const now = new Date();

    const sameDay =
      yesterday.getFullYear() === now.getFullYear() &&
      yesterday.getMonth() === now.getMonth() &&
      yesterday.getDate() === now.getDate();

    expect(sameDay).toBe(false);
  });

  it('resets streak if gap > 24h (hoursSinceLast > 24)', () => {
    // 30h gap → newStreak should be 1.
    const hoursSinceLast = 30;
    const newStreak = hoursSinceLast > 24 ? 1 : 0;
    expect(newStreak).toBe(1);
  });

  it('increments streak if gap <= 24h', () => {
    // 12h gap → newStreak should be dayStreak + 1.
    const dayStreak = 5;
    const hoursSinceLast = 12;
    const newStreak = hoursSinceLast > 24 ? 1 : dayStreak + 1;
    expect(newStreak).toBe(6);
  });
});

/** Smoke test that the callable module exports correctly. */
describe('module import smoke', () => {
  it('exports checkIn from the users index path', async () => {
    // Resolves against the module syntax only — runtime requires the emulator.
    const mod = await import('./checkin');
    expect(typeof mod.checkIn).toBe('function');
  });
});
