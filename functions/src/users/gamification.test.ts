import { describe, it, expect } from 'vitest';
import { levelFromXp, missingSeason0Fields } from './gamification';

const COMPLETE = {
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

describe('levelFromXp', () => {
  it('matches the Season 0 level bands', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpToNextLevel: 400 });
    expect(levelFromXp(399)).toEqual({ level: 1, xpToNextLevel: 1 });
    expect(levelFromXp(400)).toEqual({ level: 2, xpToNextLevel: 500 });
    expect(levelFromXp(900)).toEqual({ level: 3, xpToNextLevel: 700 });
    expect(levelFromXp(2500)).toEqual({ level: 5, xpToNextLevel: 1100 });
  });
});

describe('missingSeason0Fields', () => {
  it('seeds every field on a pre-Season-0 user doc', () => {
    expect(missingSeason0Fields({ fullName: 'Test' })).toEqual(COMPLETE);
  });

  it('returns nothing for a fully seeded doc (idempotent)', () => {
    expect(missingSeason0Fields({ ...COMPLETE })).toEqual({});
  });

  it('treats null and 0 as present, not missing', () => {
    expect(missingSeason0Fields({ ...COMPLETE, xp: 0, homeCity: null })).toEqual({});
  });

  it('never overwrites progress when only some fields are missing', () => {
    // A user who checked in and created a family before the seed ever ran:
    // awardXp/checkIn/createFamily wrote these, the claim flags are absent.
    const doc = {
      xp: 650,
      level: 2,
      xpToNextLevel: 250,
      dayStreak: 4,
      lastCheckInAt: '2026-09-18T08:00:00Z',
      familyId: 'fam-1',
      familyRole: 'creator',
    };

    const patch = missingSeason0Fields(doc);

    expect(patch).toEqual({
      hasClaimedProfileComplete: false,
      hasClaimedInterests: false,
      hasClaimedZone: false,
      hasClaimedFamily: false,
      interests: [],
      homeCity: null,
    });
  });

  it('derives level and xpToNextLevel from existing XP instead of resetting to level 1', () => {
    expect(missingSeason0Fields({ ...COMPLETE, xp: 950, level: undefined, xpToNextLevel: undefined }))
      .toEqual({ level: 3, xpToNextLevel: 650 });
  });
});

describe('module import smoke', () => {
  it('exports seedDefaultSeason0Progress', async () => {
    const mod = await import('./gamification');
    expect(typeof mod.seedDefaultSeason0Progress).toBe('function');
  });
});
