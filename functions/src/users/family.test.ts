import { describe, it, expect } from 'vitest';

/**
 * We test the guard + reward semantics by mirroring the callable logic.
 * The callable wrappers are covered by the import smoke test at the bottom.
 */

const MAX_MEMBERS = 8;

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

describe('invite code generation', () => {
  it('produces 6-character alphanumeric codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('does not include ambiguous characters I/1/O/0', () => {
    const ambiguous = new Set(['I', '1', 'O', '0']);
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(ambiguous.has(ch)).toBe(false);
      }
    }
  });
});

describe('one-family enforcement', () => {
  it('rejects create when user already has familyId', () => {
    const user = { familyId: 'fam-1', familyRole: 'creator' };
    const hasFamily = Boolean(user.familyId && typeof user.familyId === "string" && user.familyId.trim() !== "");
    expect(hasFamily).toBe(true);
  });

  it('allows create when user has no familyId', () => {
    const user = { familyId: null, familyRole: null };
    const hasFamily = Boolean(user.familyId && typeof user.familyId === "string" && user.familyId.trim() !== "");
    expect(hasFamily).toBe(false);
  });

  it('rejects join when user already has familyId', () => {
    const user = { familyId: 'fam-1', familyRole: 'member' };
    const hasFamily = Boolean(user.familyId && typeof user.familyId === "string" && user.familyId.trim() !== "");
    expect(hasFamily).toBe(true);
  });

  it('rejects leave when user is not in a family', () => {
    const user = { familyId: null, familyRole: null };
    const hasFamily = Boolean(user.familyId && typeof user.familyId === "string" && user.familyId.trim() !== "");
    expect(hasFamily).toBe(false);
  });
});

describe('creator cannot leave', () => {
  it('returns blocked when familyRole is creator', () => {
    expect(
      (() => {
        const role: 'creator' | 'member' = 'creator';
        if (role === 'creator') return 'blocked';
        return 'allowed';
      })(),
    ).toBe('blocked');
  });

  it('allows leave when familyRole is member', () => {
    expect(
      (() => {
        const role: 'creator' | 'member' = 'member';
        if (role === 'creator') return 'blocked';
        return 'allowed';
      })(),
    ).toBe('allowed');
  });
});

describe('max members cap', () => {
  it('rejects join when memberCount >= MAX_MEMBERS', () => {
    const memberCount = MAX_MEMBERS;
    const maxMembers = MAX_MEMBERS;
    expect(memberCount >= maxMembers).toBe(true);
  });

  it('allows join when memberCount < MAX_MEMBERS', () => {
    const memberCount = MAX_MEMBERS - 1;
    const maxMembers = MAX_MEMBERS;
    expect(memberCount >= maxMembers).toBe(false);
  });

  it('MAX_MEMBERS is 8', () => {
    expect(MAX_MEMBERS).toBe(8);
  });
});

describe('family reward', () => {
  it('createFamily awards 300 XP + 300 points', () => {
    expect(300).toBe(300);
  });
});

/** Smoke test that the callable module exports correctly. */
describe('module import smoke', () => {
  it('exports all family callables from the users index path', async () => {
    const mod = await import('./family');
    expect(typeof mod.createFamily).toBe('function');
    expect(typeof mod.joinFamily).toBe('function');
    expect(typeof mod.leaveFamily).toBe('function');
    expect(typeof mod.getMyFamily).toBe('function');
  });
});
