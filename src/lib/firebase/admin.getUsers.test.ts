import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({ cancelBooking: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', async () => (await import('./adminListFake.testutil')).firestoreFake);

import { where } from 'firebase/firestore';
import { fakeDb, seedUsers } from './adminListFake.testutil';
import { getUsers, type PageCursors } from './admin';

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const ids = (r: { users: { id: string }[] }) => r.users.map((u) => u.id);

beforeEach(() => {
  vi.clearAllMocks();
  seedUsers({
    alive: { fullName: 'Anna Attiva', email: 'anna@example.com', role: 'customer', createdAt: day(3) },
    banned: {
      fullName: 'Bruno Sospeso',
      email: 'bruno@example.com',
      phone: '+39 333 111 2222',
      role: 'provider',
      isSuspended: true,
      createdAt: day(2),
    },
    gone: { fullName: 'Demo Presentazione', email: 'demo@example.com', isDeleted: true, createdAt: day(1) },
  });
});

describe('getUsers', () => {
  it('drops soft-deleted accounts, newest first, with the filtered total', async () => {
    const result = await getUsers({});

    expect(ids(result)).toEqual(['alive', 'banned']);
    expect(result.total).toBe(2);
    expect(where).toHaveBeenCalledWith('adminHidden', '==', false);
  });

  it('applies the status filter server-side', async () => {
    expect(ids(await getUsers({ status: 'suspended' }))).toEqual(['banned']);
    expect(ids(await getUsers({ status: 'active' }))).toEqual(['alive']);
    expect(where).toHaveBeenCalledWith('isSuspended', '==', true);
    expect(where).toHaveBeenCalledWith('isSuspended', '==', false);
  });

  it('applies the role filter', async () => {
    expect(ids(await getUsers({ role: 'provider' }))).toEqual(['banned']);
    expect(ids(await getUsers({ role: 'all' }))).toEqual(['alive', 'banned']);
  });

  it('shows only hidden accounts (soft-deleted or seeded demo) under the hidden status', async () => {
    seedUsers({
      alive: { fullName: 'Anna', email: 'anna@example.com', createdAt: day(9) },
      gone: { fullName: 'Gone', email: 'gone@example.com', isDeleted: true, createdAt: day(8) },
      // deletedAt alone (no isDeleted flag) must hide it too.
      goneToo: { fullName: 'Gone Too', email: 'gonetoo@example.com', deletedAt: day(1), createdAt: day(7) },
      // Hidden by email domain — id deliberately doesn't hint at "provider"/"customer".
      demoSeed: { fullName: 'Seed', email: 'seed@demo.vfit', createdAt: day(6) },
      // Hidden by id prefix alone — a normal-looking email must not save it.
      provider_42: { fullName: 'Provider Seed', email: 'provider42@example.com', createdAt: day(5) },
      customer_7: { fullName: 'Customer Seed', email: 'customer7@example.com', createdAt: day(4) },
    });

    expect(ids(await getUsers({ status: 'hidden' }))).toEqual([
      'gone',
      'goneToo',
      'demoSeed',
      'provider_42',
      'customer_7',
    ]);
    expect(ids(await getUsers({ status: 'all' }))).toEqual(['alive']);
  });

  it('searches by name prefix, email and phone through searchTokens', async () => {
    expect(ids(await getUsers({ search: 'ANN' }))).toEqual(['alive']);
    expect(ids(await getUsers({ search: 'sosp' }))).toEqual(['banned']);
    expect(ids(await getUsers({ search: 'bruno@example.com' }))).toEqual(['banned']);
    expect(ids(await getUsers({ search: '333 111' }))).toEqual(['banned']);
    expect(ids(await getUsers({ search: 'nobody' }))).toEqual([]);
    // A hidden account stays hidden from search too.
    expect(ids(await getUsers({ search: 'demo' }))).toEqual([]);
    expect(where).toHaveBeenCalledWith('searchTokens', 'array-contains', 'ann');
  });

  it('combines search with the other filters and counts the combination', async () => {
    const result = await getUsers({ search: 'b', role: 'provider', status: 'suspended' });
    expect(ids(result)).toEqual(['banned']);
    expect(result.total).toBe(1);
  });

  it("uses the doc id for id/uid even when the stored data carries a different id/uid field", async () => {
    seedUsers({ real: { fullName: 'Real Doc', id: 'other', uid: 'other', createdAt: day(1) } });

    const { users } = await getUsers({});
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('real');
    expect(users[0].uid).toBe('real');
  });
});

describe('getUsers pagination', () => {
  beforeEach(() => {
    seedUsers(
      Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [`u${i + 1}`, { fullName: `User ${i + 1}`, createdAt: day(i + 1) }])
      )
    );
  });

  it('reads one page at a time and walks forward and back with cursors', async () => {
    let cursors: PageCursors = new Map();
    const page = async (n: number) => {
      fakeDb.reads = 0;
      const r = await getUsers({ page: n, limit: 3 }, cursors);
      cursors = r.cursors;
      return { ids: ids(r), total: r.total, reads: fakeDb.reads };
    };

    expect(await page(1)).toEqual({ ids: ['u7', 'u6', 'u5'], total: 7, reads: 3 });
    expect(await page(2)).toEqual({ ids: ['u4', 'u3', 'u2'], total: 7, reads: 3 });
    expect(await page(3)).toEqual({ ids: ['u1'], total: 7, reads: 1 });
    // Back: the cursor of page 1 is still known, so page 2 is again one short read.
    expect(await page(2)).toEqual({ ids: ['u4', 'u3', 'u2'], total: 7, reads: 3 });
  });

  it('reaches a page without cursors (a ?page=N URL) and records the cursors on the way', async () => {
    fakeDb.reads = 0;
    const r = await getUsers({ page: 3, limit: 3 });

    expect(ids(r)).toEqual(['u1']);
    expect(r.total).toBe(7);
    expect(fakeDb.reads).toBe(7);
    expect([...r.cursors.keys()].sort()).toEqual([1, 2, 3]);

    fakeDb.reads = 0;
    const back = await getUsers({ page: 2, limit: 3 }, r.cursors);
    expect(ids(back)).toEqual(['u4', 'u3', 'u2']);
    expect(fakeDb.reads).toBe(3);
  });
});
