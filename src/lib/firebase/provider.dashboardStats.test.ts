import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BOOKED_STATUSES, CALENDAR_STATUSES, DELIVERED_STATUSES } from '@/lib/bookingStatus';

/**
 * getProviderDashboardStats() used to await the provider doc, then today/week/month bookings,
 * new clients and recent bookings one after another — up to six sequential round trips on
 * every dashboard mount. It now fires them together with Promise.all and uses
 * getCountFromServer/getAggregateFromServer for the three counts and the one sum, so only the
 * completion-rate/chart query (which needs the actual documents) still reads full bookings.
 * These tests assert both: the aggregation calls happen instead of full-collection reads, and
 * the returned numbers are unchanged.
 */

vi.mock('./config', () => ({
  auth: { currentUser: { uid: 'provider-1' } },
  db: {},
  functions: {},
}));
vi.mock('./functions', () => ({
  acceptBooking: vi.fn(),
  declineBooking: vi.fn(),
  cancelBookingAsTrainer: vi.fn(),
  completeBooking: vi.fn(),
  confirmBookingPayment: vi.fn(),
}));

type Where = { field: string; op: string; value: unknown };
type Ref = { kind: 'collection' | 'doc'; name: string; id?: string };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string): Ref => ({ kind: 'collection', name })),
  doc: vi.fn((_db: unknown, name: string, id: string): Ref => ({ kind: 'doc', name, id })),
  query: vi.fn((ref: Ref, ...constraints: Where[]) => ({ ref, constraints })),
  where: vi.fn((field: string, op: string, value: unknown): Where => ({ field, op, value })),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  writeBatch: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  getAggregateFromServer: vi.fn(),
  sum: vi.fn((field: string) => ({ kind: 'sum', field })),
  Timestamp: {
    fromDate: (d: Date) => ({ kind: 'timestamp', ms: d.getTime() }),
  },
}));

import {
  getDoc,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
} from 'firebase/firestore';
import { getProviderDashboardStats } from './provider';

function statusValue(q: { constraints: Where[] }): unknown {
  return q.constraints.find((c) => c.field === 'status')?.value;
}

function recentBookingDoc(status: string, daysAgo: number, finalPrice?: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    data: () => ({
      status,
      scheduledAt: { toDate: () => date },
      finalPrice,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getDoc).mockImplementation(async (ref: unknown) => {
    const r = ref as Ref;
    if (r.name === 'users') {
      return { exists: () => true, data: () => ({ role: 'provider' }) } as never;
    }
    if (r.name === 'instructors') {
      return { exists: () => true, data: () => ({ ratingAvg: 4.8 }) } as never;
    }
    throw new Error(`unexpected getDoc ref ${JSON.stringify(r)}`);
  });

  vi.mocked(getCountFromServer).mockImplementation(async (q: unknown) => {
    const query = q as { ref: Ref; constraints: Where[] };
    if (query.ref.name === 'clients') {
      return { data: () => ({ count: 3 }) } as never;
    }
    const status = statusValue(query);
    if (status === BOOKED_STATUSES) return { data: () => ({ count: 2 }) } as never;
    if (status === CALENDAR_STATUSES) return { data: () => ({ count: 5 }) } as never;
    throw new Error(`unexpected count query ${JSON.stringify(query)}`);
  });

  vi.mocked(getAggregateFromServer).mockImplementation(async (q: unknown) => {
    const query = q as { constraints: Where[] };
    const status = statusValue(query);
    if (status === DELIVERED_STATUSES) return { data: () => ({ total: 450 }) } as never;
    throw new Error(`unexpected aggregate query ${JSON.stringify(query)}`);
  });

  vi.mocked(getDocs).mockResolvedValue({
    forEach: (fn: (doc: unknown) => void) =>
      [
        recentBookingDoc('completed', 2, 50),
        recentBookingDoc('completed', 5, 50),
        recentBookingDoc('cancelled_by_client', 10),
      ].forEach(fn),
  } as never);
});

describe('getProviderDashboardStats', () => {
  it('fires the independent reads together instead of one after another', async () => {
    await getProviderDashboardStats();

    // One getDoc for the provider record (the auth-role check inside getCurrentProviderId
    // is a separate, necessarily-earlier read on the `users` doc).
    expect(getDoc).toHaveBeenCalledTimes(2);
    // today, week, newClients — each a count, not a full read.
    expect(getCountFromServer).toHaveBeenCalledTimes(3);
    // monthEarnings — a sum, not a full read.
    expect(getAggregateFromServer).toHaveBeenCalledTimes(1);
    // Only the completion-rate/chart query still reads full documents.
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('returns the same numbers the sequential version used to compute', async () => {
    const stats = await getProviderDashboardStats();

    expect(stats.todayAppointments).toBe(2);
    expect(stats.weekBookings).toBe(5);
    expect(stats.monthEarnings).toBe(450);
    expect(stats.newClients).toBe(3);
    // 2 completed out of 3 outcome bookings in the last 30 days.
    expect(stats.completionRate).toBe(67);
    expect(stats.averageRating).toBe(4.8);
    expect(stats.chartData).toHaveLength(30);
  });

  it('treats a missing month-earnings sum as zero, same as the old `|| 0`', async () => {
    vi.mocked(getAggregateFromServer).mockResolvedValue({ data: () => ({ total: undefined }) } as never);

    const stats = await getProviderDashboardStats();
    expect(stats.monthEarnings).toBe(0);
  });

  it('returns default zero stats when the provider has no instructors document, without erroring', async () => {
    vi.mocked(getDoc).mockImplementation(async (ref: unknown) => {
      const r = ref as Ref;
      if (r.name === 'users') return { exists: () => true, data: () => ({ role: 'provider' }) } as never;
      if (r.name === 'instructors') return { exists: () => false, data: () => undefined } as never;
      throw new Error('unexpected ref');
    });

    const stats = await getProviderDashboardStats();

    expect(stats).toEqual({
      todayAppointments: 0,
      weekBookings: 0,
      monthEarnings: 0,
      newClients: 0,
      completionRate: 0,
      averageRating: 0,
      chartData: [],
    });
  });

  it('rejects when the caller is not signed in as a provider', async () => {
    vi.mocked(getDoc).mockImplementation(async (ref: unknown) => {
      const r = ref as Ref;
      if (r.name === 'users') return { exists: () => true, data: () => ({ role: 'customer' }) } as never;
      throw new Error('unexpected ref');
    });

    await expect(getProviderDashboardStats()).rejects.toThrow('Not authorized as provider');
  });
});
