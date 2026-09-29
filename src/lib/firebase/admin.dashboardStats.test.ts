import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getAdminDashboardStats() and getPendingVerifications() used to read the ENTIRE `users`
 * collection just to compute a total count and a filtered pending count — on staging/prod
 * that's every customer, every provider and every applicant, read in full, on every admin
 * dashboard load. They now:
 *  - use getCountFromServer/getAggregateFromServer for totalUsers, activeProviders,
 *    todayBookings and monthlyRevenue (pure counts/sums, no documents needed), and
 *  - narrow the pending-verification scan to two precise queries (role == 'provider',
 *    providerStatus == 'pending') whose union is read and filtered in memory, since
 *    needsVerificationDecision()/isHiddenAccount() depend on fields that can be *absent* —
 *    which a Firestore equality filter can never match — so the final decision still has to
 *    run against real documents, just a bounded set of them instead of the whole collection.
 *
 * These tests assert both things: the numbers are unchanged, and no call ever reads the
 * unfiltered `users` collection to get there (aside from the one intentional exception —
 * the plain total-users count, which now uses getCountFromServer instead of getDocs).
 */

vi.mock('./config', () => ({
  auth: {},
  db: {},
  getFunctionsInstance: vi.fn(async () => ({})),
}));
vi.mock('./functions', () => ({
  cancelBooking: vi.fn(),
  decideProviderApplication: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

type Where = { field: string; op: string; value: unknown };
type Ref = { kind: 'collection'; name: string };
type Query = { ref: Ref; constraints: Where[] };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string): Ref => ({ kind: 'collection', name })),
  query: vi.fn((ref: Ref, ...constraints: unknown[]): Query => ({ ref, constraints: constraints as Where[] })),
  where: vi.fn((field: string, op: string, value: unknown): Where => ({ field, op, value })),
  orderBy: vi.fn((field: string, dir?: string) => ({ kind: 'orderBy', field, dir })),
  limit: vi.fn((n: number) => ({ kind: 'limit', n })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  getCountFromServer: vi.fn(),
  getAggregateFromServer: vi.fn(),
  sum: vi.fn((field: string) => ({ kind: 'sum', field })),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: class {
    static fromDate(d: Date) {
      const t = new this();
      (t as any).ms = d.getTime();
      return t;
    }
  },
  startAfter: vi.fn(),
  writeBatch: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import { getDocs, getCountFromServer, getAggregateFromServer } from 'firebase/firestore';
import { getAdminDashboardStats, getPendingVerifications } from './admin';

function fieldValue(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((o, k) => (o as any)?.[k], data);
}

function matches(data: Record<string, unknown>, c: Where): boolean {
  const actual = fieldValue(data, c.field);
  if (c.op === '==') return actual === c.value;
  if (c.op === 'in') return (c.value as unknown[]).includes(actual);
  if (c.op === '>=' || c.op === '<=' || c.op === '<') return true; // date ranges aren't exercised here
  throw new Error(`unsupported op ${c.op}`);
}

function asQuery(q: Ref | Query): Query {
  return 'ref' in q ? q : { ref: q, constraints: [] };
}

let users: Record<string, Record<string, unknown>>;
let demoBookings: Record<string, unknown>[];
let demoTransactions: Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();

  users = {
    // Verified provider: must not count as pending, active or not.
    verifiedPro: { role: 'provider', providerProfile: { isVerified: true, isActive: true } },
    inactivePro: { role: 'provider', providerProfile: { isVerified: true, isActive: false } },
    // No providerStatus, no verification flag at all — the backfill-shaped gap that must
    // still surface as pending.
    unverifiedPro: { role: 'provider' },
    // Rejected takes precedence over "role == provider and unverified".
    rejectedPro: { role: 'provider', providerStatus: 'rejected' },
    // Applicant: still role 'customer' until the decision.
    applicant: { role: 'customer', providerStatus: 'pending' },
    rejectedApplicant: { role: 'customer', providerStatus: 'rejected' },
    plainCustomer: { role: 'customer' },
    // Would need a decision on the merits, but is a hidden seed account.
    hiddenPendingPro: { role: 'provider', isDeleted: true },
  };
  demoBookings = [];
  demoTransactions = [];

  vi.mocked(getDocs).mockImplementation((async (raw: Ref | Query) => {
    const q = asQuery(raw);
    if (q.ref.name === 'users') {
      if (q.constraints.length === 0) {
        throw new Error('unexpected unfiltered read of the users collection');
      }
      return {
        docs: Object.entries(users)
          .filter(([, data]) => q.constraints.every((c) => matches(data, c)))
          .map(([id, data]) => ({ id, data: () => data })),
      };
    }
    if (q.ref.name === 'bookings' || q.ref.name === 'transactions') {
      // Only the D5 demo read touches these collections with getDocs.
      expect(q.constraints).toEqual([{ field: 'isDemo', op: '==', value: true }]);
      const rows = q.ref.name === 'bookings' ? demoBookings : demoTransactions;
      return { docs: rows.map((data, i) => ({ id: `${q.ref.name}-${i}`, data: () => data })) };
    }
    if (q.ref.name === 'systemLogs') {
      return {
        docs: [{ id: 'log1', data: () => ({ action: 'VERIFY_PROVIDER', timestamp: { toDate: () => new Date('2026-01-01') } }) }],
      };
    }
    throw new Error(`unexpected getDocs on ${q.ref.name}`);
  }) as never);

  vi.mocked(getCountFromServer).mockImplementation((async (raw: Ref | Query) => {
    const q = asQuery(raw);
    if (q.ref.name === 'users') {
      const count = Object.entries(users).filter(([, data]) => q.constraints.every((c) => matches(data, c))).length;
      return { data: () => ({ count }) };
    }
    if (q.ref.name === 'bookings') {
      return { data: () => ({ count: 4 }) };
    }
    throw new Error(`unexpected getCountFromServer on ${q.ref.name}`);
  }) as never);

  vi.mocked(getAggregateFromServer).mockImplementation((async () => ({
    data: () => ({ total: 999 }),
  })) as never);
});

describe('getAdminDashboardStats', () => {
  it('counts instead of scanning, and never reads the unfiltered users collection', async () => {
    const stats = await getAdminDashboardStats();

    expect(stats.totalUsers).toBe(Object.keys(users).length);
    // Only verifiedPro is role provider AND providerProfile.isActive === true.
    expect(stats.activeProviders).toBe(1);
    expect(stats.todayBookings).toBe(4);
    expect(stats.monthlyRevenue).toBe(999);
    // unverifiedPro (backfill gap) + applicant (pending); everyone else is verified, rejected,
    // a plain customer, or hidden.
    expect(stats.pendingVerifications).toBe(2);

    expect(getCountFromServer).toHaveBeenCalledTimes(3);
    expect(getAggregateFromServer).toHaveBeenCalledTimes(1);
    // Two precise queries for the pending-verification candidates, one for recent activity,
    // three `isDemo == true` reads (users, bookings, transactions) — never a bare scan of `users`.
    expect(getDocs).toHaveBeenCalledTimes(6);
  });

  it('leaves demo accounts, bookings and transactions out of every counter (D5)', async () => {
    users.demoCustomer = { role: 'customer', isDemo: true };
    users.demoProvider = { role: 'provider', isDemo: true, providerProfile: { isVerified: true, isActive: true } };
    const future = { toMillis: () => Date.now() + 86_400_000 };
    const past = { toMillis: () => Date.now() - 40 * 86_400_000 };
    // Two demo bookings from today on, one long past (not in "today's bookings" to begin with).
    demoBookings = [
      { isDemo: true, scheduledAt: future },
      { isDemo: true, scheduledAt: future },
      { isDemo: true, scheduledAt: past },
    ];
    demoTransactions = [
      { isDemo: true, type: 'booking_payment', status: 'completed', amount: 150, createdAt: { toMillis: () => Date.now() } },
      // Not revenue: wrong type / status / month — never in the sum, so never subtracted.
      { isDemo: true, type: 'refund', status: 'completed', amount: 70, createdAt: { toMillis: () => Date.now() } },
      { isDemo: true, type: 'booking_payment', status: 'pending', amount: 60, createdAt: { toMillis: () => Date.now() } },
      { isDemo: true, type: 'booking_payment', status: 'completed', amount: 90, createdAt: past },
    ];

    const stats = await getAdminDashboardStats();

    // The 8 real users of the fixture; the two demo ones are counted, then subtracted.
    expect(stats.totalUsers).toBe(8);
    expect(stats.activeProviders).toBe(1);
    expect(stats.todayBookings).toBe(4 - 2);
    expect(stats.monthlyRevenue).toBe(999 - 150);
    // The demo provider is verified; it never needed a decision.
    expect(stats.pendingVerifications).toBe(2);
  });

  it('treats a missing monthly-revenue sum as zero, same as the old `|| 0`', async () => {
    vi.mocked(getAggregateFromServer).mockResolvedValue({ data: () => ({ total: undefined }) } as never);

    const stats = await getAdminDashboardStats();
    expect(stats.monthlyRevenue).toBe(0);
  });
});

describe('getPendingVerifications', () => {
  it('matches the dashboard counter exactly, newest first', async () => {
    const result = await getPendingVerifications();

    expect(result.map((p) => p.id)).toEqual(['unverifiedPro', 'applicant']);
  });

  it('never reads the unfiltered users collection', async () => {
    await getPendingVerifications();

    for (const call of vi.mocked(getDocs).mock.calls) {
      const q = asQuery(call[0] as unknown as Ref | Query);
      if (q.ref.name === 'users') {
        expect(q.constraints.length).toBeGreaterThan(0);
      }
    }
  });
});
