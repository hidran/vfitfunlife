import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({ cancelBooking: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', async () => (await import('./adminListFake.testutil')).firestoreFake);

import { orderBy, where } from 'firebase/firestore';
import { fakeDb, seedDocs } from './adminListFake.testutil';
import { bookingSearch, getBookings, getSystemLogs, type PageCursors } from './admin';

const day = (n: number) => new Date(2026, 5, n, 10);
const ids = (r: { bookings: { id: string }[] }) => r.bookings.map((b) => b.id);

const booking = (n: number, extra: Record<string, unknown> = {}) => ({
  userId: 'cust-a',
  userEmail: 'anna@example.com',
  instructorId: 'trainer-x',
  status: 'completed',
  scheduledAt: day(n),
  createdAt: day(1),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  seedDocs({
    b1: booking(1),
    b2: booking(2, { status: 'requested', userId: 'cust-b', userEmail: 'bruno@example.com' }),
    b3: booking(3, { instructorId: 'trainer-y' }),
    b4: booking(4, { status: 'payment_confirmed', paymentConfirmation: { clientResponse: 'disputed' } }),
    b5: booking(5, { status: 'accepted', userId: 'cust-b', userEmail: 'bruno@example.com', instructorId: 'trainer-y' }),
  });
});

describe('bookingSearch', () => {
  it('treats anything with an @ as a (lowercased) customer email, anything else as an id', () => {
    expect(bookingSearch('  Anna@Example.com ')).toEqual({ kind: 'email', value: 'anna@example.com' });
    expect(bookingSearch('b1')).toEqual({ kind: 'id', value: 'b1' });
    expect(bookingSearch('   ')).toBeNull();
    expect(bookingSearch(undefined)).toBeNull();
  });
});

describe('getBookings', () => {
  it('lists by session date, latest first, with the total, ordered server-side', async () => {
    const result = await getBookings({});
    expect(ids(result)).toEqual(['b5', 'b4', 'b3', 'b2', 'b1']);
    expect(result.total).toBe(5);
    expect(orderBy).toHaveBeenCalledWith('scheduledAt', 'desc');
  });

  it('filters by status server-side', async () => {
    expect(ids(await getBookings({ status: 'completed' }))).toEqual(['b3', 'b1']);
    expect(ids(await getBookings({ status: 'all' }))).toHaveLength(5);
    expect(where).toHaveBeenCalledWith('status', '==', 'completed');
  });

  it('"disputed" filters on the client response to the payment confirmation, not on status', async () => {
    expect(ids(await getBookings({ status: 'disputed' }))).toEqual(['b4']);
    expect(where).toHaveBeenCalledWith('paymentConfirmation.clientResponse', '==', 'disputed');
    expect(where).not.toHaveBeenCalledWith('status', '==', 'disputed');
  });

  it('filters by provider (instructorId) and customer (userId)', async () => {
    expect(ids(await getBookings({ providerId: 'trainer-y' }))).toEqual(['b5', 'b3']);
    expect(ids(await getBookings({ customerId: 'cust-b' }))).toEqual(['b5', 'b2']);
    expect(where).toHaveBeenCalledWith('instructorId', '==', 'trainer-y');
  });

  it('filters by a scheduledAt date range, inclusive at both ends', async () => {
    const result = await getBookings({ dateFrom: day(2), dateTo: day(4) });
    expect(ids(result)).toEqual(['b4', 'b3', 'b2']);
    expect(result.total).toBe(3);
  });

  it('finds a booking by its exact id, still honouring the other filters', async () => {
    fakeDb.reads = 0;
    const hit = await getBookings({ search: ' b3 ' });
    expect(ids(hit)).toEqual(['b3']);
    expect(hit.total).toBe(1);
    expect(fakeDb.reads).toBe(1);

    expect((await getBookings({ search: 'b3', status: 'requested' })).total).toBe(0);
  });

  it('falls back to a customer uid, then a provider uid, when the text is no booking id', async () => {
    expect(ids(await getBookings({ search: 'cust-b' }))).toEqual(['b5', 'b2']);
    expect(ids(await getBookings({ search: 'trainer-y', status: 'completed' }))).toEqual(['b3']);
    expect((await getBookings({ search: 'nobody' })).total).toBe(0);
  });

  it('searches an email as the customer email, exact and case-insensitive', async () => {
    expect(ids(await getBookings({ search: 'BRUNO@example.com' }))).toEqual(['b5', 'b2']);
    expect(ids(await getBookings({ search: 'bruno@' }))).toEqual([]);
    expect(where).toHaveBeenCalledWith('userEmail', '==', 'bruno@example.com');
  });

  it('pages with cursors: one short read per page, and back', async () => {
    let cursors: PageCursors = new Map();
    const page = async (n: number) => {
      fakeDb.reads = 0;
      const r = await getBookings({ page: n, limit: 2 }, cursors);
      cursors = r.cursors;
      return { ids: ids(r), total: r.total, reads: fakeDb.reads };
    };
    expect(await page(1)).toEqual({ ids: ['b5', 'b4'], total: 5, reads: 2 });
    expect(await page(2)).toEqual({ ids: ['b3', 'b2'], total: 5, reads: 2 });
    expect(await page(3)).toEqual({ ids: ['b1'], total: 5, reads: 1 });
    expect(await page(2)).toEqual({ ids: ['b3', 'b2'], total: 5, reads: 2 });
  });

  it('reaches a deep page without cursors and records them on the way', async () => {
    const r = await getBookings({ page: 3, limit: 2 });
    expect(ids(r)).toEqual(['b1']);
    expect([...r.cursors.keys()].sort()).toEqual([1, 2, 3]);
  });
});

describe('getSystemLogs', () => {
  beforeEach(() => {
    seedDocs({
      l1: { action: 'VERIFY_PROVIDER', severity: 'info', by: 'admin-1', timestamp: day(1) },
      l2: { action: 'SUSPEND_USER', severity: 'warning', by: 'admin-2', timestamp: day(2) },
      l3: { action: 'VERIFY_PROVIDER', severity: 'info', by: 'admin-2', timestamp: day(3) },
      l4: { action: 'PROCESS_REFUND', severity: 'error', by: 'admin-1', timestamp: day(4) },
    });
  });
  const logIds = (r: { logs: { id: string }[] }) => r.logs.map((l) => l.id);

  it('lists newest first by timestamp, one page at a time, with the total', async () => {
    const first = await getSystemLogs({ limit: 3 });
    expect(logIds(first)).toEqual(['l4', 'l3', 'l2']);
    expect(first.total).toBe(4);
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');

    fakeDb.reads = 0;
    const second = await getSystemLogs({ limit: 3, page: 2 }, first.cursors);
    expect(logIds(second)).toEqual(['l1']);
    expect(fakeDb.reads).toBe(1);
  });

  it('filters by severity, action, actor (search or userId) and date range server-side', async () => {
    expect(logIds(await getSystemLogs({ severity: 'info' }))).toEqual(['l3', 'l1']);
    expect(logIds(await getSystemLogs({ action: 'VERIFY_PROVIDER', severity: 'all' }))).toEqual(['l3', 'l1']);
    expect(logIds(await getSystemLogs({ search: ' admin-2 ' }))).toEqual(['l3', 'l2']);
    expect(logIds(await getSystemLogs({ userId: 'admin-1' }))).toEqual(['l4', 'l1']);
    expect(logIds(await getSystemLogs({ dateFrom: day(2), dateTo: day(3) }))).toEqual(['l3', 'l2']);
    expect(where).toHaveBeenCalledWith('by', '==', 'admin-2');
    expect(where).toHaveBeenCalledWith('action', '==', 'VERIFY_PROVIDER');
  });
});
