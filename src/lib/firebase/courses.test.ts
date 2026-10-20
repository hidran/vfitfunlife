import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({ constraints: [] as unknown[][], callable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ kind: 'collection', path: path.join('/') }),
  collectionGroup: (_db: unknown, id: string) => ({ kind: 'group', id }),
  doc: vi.fn(), getDoc: vi.fn(), startAfter: vi.fn(),
  where: (field: string, op: string, value: unknown) => ({ t: 'where', field, op, value }),
  orderBy: (field: string) => ({ t: 'orderBy', field }),
  limit: (n: number) => ({ t: 'limit', n }),
  query: (source: unknown, ...constraints: unknown[]) => { calls.constraints.push([source, ...constraints]); return { source }; },
  getDocs: vi.fn(async () => ({ docs: [] })),
  Timestamp: { now: () => ({ millis: 1000 }), fromMillis: (millis: number) => ({ millis }) },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => calls.callable }));
vi.mock('./config', () => ({ db: {} }));
vi.mock('./app', () => ({ getFunctionsInstance: async () => ({}) }));

import { fetchVenueWeek, fetchMyWaitlist, fetchVenueCourses, fetchWaitlist, saveCourse, quoteCourse, joinCourseWaitlist } from './courses';

beforeEach(() => { calls.constraints.length = 0; calls.callable.mockReset(); calls.callable.mockResolvedValue({ data: { ok: true } }); });

describe('course client wrappers', () => {
  it('queries a venue week with the equalities the rule and index prove, padded by UTC days', async () => {
    await fetchVenueWeek('v1', '2099-10-26');
    const [source, ...rest] = calls.constraints[0] as [{ kind: string; id: string }, ...Record<string, unknown>[]];
    expect(source).toEqual({ kind: 'group', id: 'sessions' });
    expect(rest.filter(c => c.op === '==').map(c => [c.field, c.value])).toEqual([['venueId', 'v1'], ['listed', true], ['state', 'scheduled']]);
    const start = Date.parse('2099-10-26T00:00:00Z');
    expect(rest.find(c => c.op === '>=')?.value).toEqual({ millis: start - 86400000 });
    expect(rest.find(c => c.op === '<')?.value).toEqual({ millis: start + 8 * 86400000 });
  });
  it('reads the customer waitlist through the collection group by user, oldest first', async () => {
    await fetchMyWaitlist('u1');
    const [source, ...rest] = calls.constraints[0] as [{ kind: string; id: string }, ...Record<string, unknown>[]];
    expect(source).toEqual({ kind: 'group', id: 'waitlist' });
    expect(rest).toEqual([{ t: 'where', field: 'userId', op: '==', value: 'u1' }, { t: 'orderBy', field: 'createdAt' }]);
  });
  it('scopes venue courses by venueId and a lesson waitlist by position', async () => {
    await fetchVenueCourses('v1');
    expect(calls.constraints[0]).toContainEqual({ t: 'where', field: 'venueId', op: '==', value: 'v1' });
    await fetchWaitlist('c1', 's1');
    expect(calls.constraints[1][0]).toEqual({ kind: 'collection', path: 'courses/c1/sessions/s1/waitlist' });
    expect(calls.constraints[1]).toContainEqual({ t: 'orderBy', field: 'position' });
  });
  it('sends providerId on a save only when given', async () => {
    const draft = { name: 'x' } as never;
    await saveCourse(draft, 'c1', 'owner');
    expect(calls.callable).toHaveBeenLastCalledWith({ course: draft, courseId: 'c1', providerId: 'owner' });
    await saveCourse(draft);
    expect(calls.callable).toHaveBeenLastCalledWith({ course: draft });
  });
  it('quotes with optional lessons and an opt-out of the series block', async () => {
    await quoteCourse('c1');
    expect(calls.callable).toHaveBeenLastCalledWith({ courseId: 'c1' });
    await quoteCourse('c1', ['s1'], false);
    expect(calls.callable).toHaveBeenLastCalledWith({ courseId: 'c1', sessionIds: ['s1'], includeSeries: false });
  });
  it('joins a waitlist with the payment mode and request id', async () => {
    await joinCourseWaitlist('c1', 's1', 'direct', 'r1');
    expect(calls.callable).toHaveBeenLastCalledWith({ courseId: 'c1', sessionId: 's1', paymentMode: 'direct', requestId: 'r1' });
  });
});
