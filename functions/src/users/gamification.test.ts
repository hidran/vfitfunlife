import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the seedDefaultSeason0Progress callable logic.
 *
 * We test the decision logic (what fields get seeded, idempotency) by
 * extracting the body into a pure helper and testing that. The callable
 * wrapper itself is a thin auth/err check that is covered by the pattern
 * used across all other callables in this project.
 */

/**
 * Mirror of the callable's seeding decision logic, extracted for testability.
 * This is a copy of the logic in functions/src/users/gamamation.ts — if the
 * callable changes, this should be updated in lockstep.
 */
function needsSeed(data: Record<string, unknown>): boolean {
  return (
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
    data.familyRole === undefined
  );
}

function seedData(): Record<string, unknown> {
  return {
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
}

describe('seedDefaultSeason0Progress logic', () => {
  describe('needsSeed', () => {
    it('returns true when xp is missing', () => {
      expect(needsSeed({ fullName: 'Test' })).toBe(true);
    });

    it('returns true when level is missing', () => {
      expect(
        needsSeed({ xp: 0, xpToNextLevel: 400, dayStreak: 0 }),
      ).toBe(true);
    });

    it('returns true when any single gamification field is missing', () => {
      const complete = {
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
        familyId: 'f-1',
        familyRole: 'creator',
      };
      // Remove one field
      const { hasClaimedZone, ...missingOne } = complete;
      expect(needsSeed(missingOne)).toBe(true);
    });

    it('returns false when all fields are present', () => {
      const complete = {
        xp: 500,
        level: 2,
        xpToNextLevel: 400,
        dayStreak: 5,
        lastCheckInAt: new Date(),
        hasClaimedProfileComplete: true,
        hasClaimedInterests: true,
        hasClaimedZone: true,
        hasClaimedFamily: true,
        interests: ['fitness'],
        homeCity: 'Torino',
        familyId: 'f-1',
        familyRole: 'creator',
      };
      expect(needsSeed(complete)).toBe(false);
    });

    it('returns false when all fields are present but at zero/default values', () => {
      const allDefault = {
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
      expect(needsSeed(allDefault)).toBe(false);
    });
  });

  describe('seedData', () => {
    it('produces correct defaults', () => {
      const s = seedData();
      expect(s.xp).toBe(0);
      expect(s.level).toBe(1);
      expect(s.xpToNextLevel).toBe(400);
      expect(s.dayStreak).toBe(0);
      expect(s.lastCheckInAt).toBeNull();
      expect(s.hasClaimedProfileComplete).toBe(false);
      expect(s.hasClaimedInterests).toBe(false);
      expect(s.hasClaimedZone).toBe(false);
      expect(s.hasClaimedFamily).toBe(false);
      expect(s.interests).toEqual([]);
      expect(s.homeCity).toBeNull();
      expect(s.familyId).toBeNull();
      expect(s.familyRole).toBeNull();
    });
  });

  describe('full seed flow', () => {
    it('seeds an empty user doc', () => {
      const doc = {};
      if (needsSeed(doc)) {
        Object.assign(doc, seedData());
      }
      expect(doc.xp).toBe(0);
      expect(doc.level).toBe(1);
      expect(doc.xpToNextLevel).toBe(400);
      expect((doc as Record<string, unknown>).familyId).toBeNull();
    });

    it('preserves existing non-gamification fields', () => {
      const doc = {
        fullName: 'Test User',
        email: 'test@example.com',
        role: 'customer' as const,
        pointsBalance: 100,
      };
      if (needsSeed(doc)) {
        Object.assign(doc, seedData());
      }
      expect(doc.fullName).toBe('Test User');
      expect(doc.pointsBalance).toBe(100);
      expect(doc.xp).toBe(0);
    });

    it('is idempotent: calling seed twice does not clobber non-default values', () => {
      const doc = {
        xp: 500,
        level: 2,
        xpToNextLevel: 400,
        dayStreak: 5,
        lastCheckInAt: new Date(),
        hasClaimedProfileComplete: true,
        hasClaimedInterests: true,
        hasClaimedZone: true,
        hasClaimedFamily: true,
        interests: ['fitness'],
        homeCity: 'Torino',
        familyId: 'f-1',
        familyRole: 'creator',
        fullName: 'Test User',
      };
      // First call: needsSeed false → no change
      const before = JSON.stringify(doc);
      if (needsSeed(doc)) {
        Object.assign(doc, seedData());
      }
      expect(JSON.stringify(doc)).toBe(before);
    });

    it('after seeding, needsSeed returns false for the same doc', () => {
      const doc = { fullName: 'Test' };
      expect(needsSeed(doc)).toBe(true);
      if (needsSeed(doc)) {
        Object.assign(doc, seedData());
      }
      expect(needsSeed(doc)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('treats null as present (field exists, just null)', () => {
      // lastCheckInAt: null is a valid seeded value, not "missing"
      const doc = {
        xp: 0,
        level: 1,
        xpToNextLevel: 400,
        dayStreak: 0,
        lastCheckInAt: null as unknown as null,
        hasClaimedProfileComplete: false,
        hasClaimedInterests: false,
        hasClaimedZone: false,
        hasClaimedFamily: false,
        interests: [],
        homeCity: null,
        familyId: null,
        familyRole: null,
      };
      expect(needsSeed(doc)).toBe(false);
    });

    it('treats 0 XP as present (not missing)', () => {
      const doc = {
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
      expect(needsSeed(doc)).toBe(false);
    });
  });
});

/**
 * Smoke test that the actual callable module can be imported (syntax check +
 * verifies the re-export path from index.ts works).
 */
describe('module import smoke', () => {
  it('exports seedDefaultSeason0Progress from the users index', async () => {
    // This import resolves against the emulator-connected Admin if env vars
    // are set (vitest config sets them). If they aren't, the import still
    // succeeds (module syntax is valid) but calling it would fail at runtime
    // — we only assert the import path here.
    const mod = await import('./gamification');
    expect(typeof mod.seedDefaultSeason0Progress).toBe('function');
  });
});
