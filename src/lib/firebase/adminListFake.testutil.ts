/**
 * A tiny in-memory stand-in for the `firebase/firestore` calls the admin list queries make
 * (where ==/in/array-contains/>=/<=, orderBy, startAfter, limit, getDocs, getCountFromServer),
 * so getUsers/getProviders are tested against real filter/cursor semantics rather than
 * against which functions they happened to call.
 *
 * Usage: vi.mock('firebase/firestore', async () => (await import('./adminListFake.testutil')).firestoreFake)
 */
import { vi } from 'vitest';
import { computeAdminIndex } from '@/lib/admin/adminIndex';

type Data = Record<string, unknown>;
type Constraint =
  | { kind: 'where'; field: string; op: string; value: unknown }
  | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter'; doc: { id: string } };

export const fakeDb = {
  docs: {} as Record<string, Data>,
  /** Documents returned by getDocs since the last reset — what a page cost. */
  reads: 0,
};

/** Seeds the collection as the backfill/trigger leaves it: derived fields and isSuspended present. */
export function seedUsers(docs: Record<string, Data>): void {
  fakeDb.reads = 0;
  fakeDb.docs = Object.fromEntries(
    Object.entries(docs).map(([id, data]) => [
      id,
      { isSuspended: false, ...data, ...computeAdminIndex(id, data) },
    ])
  );
}

const get = (data: Data, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Data)[k] : undefined), data);

const cmp = (a: unknown, b: unknown): number => {
  const av = a instanceof Date ? a.getTime() : (a as number);
  const bv = b instanceof Date ? b.getTime() : (b as number);
  return av < bv ? -1 : av > bv ? 1 : 0;
};

function matches(data: Data, c: Extract<Constraint, { kind: 'where' }>): boolean {
  const actual = get(data, c.field);
  switch (c.op) {
    case '==':
      return actual === c.value;
    case 'in':
      return (c.value as unknown[]).includes(actual);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(c.value);
    case '>=':
      return actual != null && cmp(actual, c.value) >= 0;
    case '<=':
      return actual != null && cmp(actual, c.value) <= 0;
    default:
      throw new Error(`unsupported op ${c.op}`);
  }
}

function run(constraints: Constraint[]) {
  let rows = Object.entries(fakeDb.docs).filter(([, data]) =>
    constraints.every((c) => c.kind !== 'where' || matches(data, c))
  );
  const order = constraints.find((c) => c.kind === 'orderBy') as
    | Extract<Constraint, { kind: 'orderBy' }>
    | undefined;
  if (order) {
    // Firestore drops documents missing the orderBy field, and breaks ties by document id
    // in the same direction.
    rows = rows.filter(([, d]) => get(d, order.field) != null);
    const sign = order.dir === 'desc' ? -1 : 1;
    rows.sort(([ia, a], [ib, b]) => sign * (cmp(get(a, order.field), get(b, order.field)) || (ia < ib ? -1 : 1)));
  }
  const after = constraints.find((c) => c.kind === 'startAfter') as
    | Extract<Constraint, { kind: 'startAfter' }>
    | undefined;
  if (after) rows = rows.slice(rows.findIndex(([id]) => id === after.doc.id) + 1);
  const lim = constraints.find((c) => c.kind === 'limit') as Extract<Constraint, { kind: 'limit' }> | undefined;
  if (lim) rows = rows.slice(0, lim.n);
  return rows;
}

class FakeTimestamp {
  static fromDate(d: Date) {
    return d;
  }
}

export const firestoreFake = {
  collection: vi.fn(() => ({})),
  query: vi.fn((_ref: unknown, ...constraints: Constraint[]) => ({ constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value })),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc' = 'asc') => ({ kind: 'orderBy', field, dir })),
  limit: vi.fn((n: number) => ({ kind: 'limit', n })),
  startAfter: vi.fn((doc: { id: string }) => ({ kind: 'startAfter', doc })),
  getDocs: vi.fn(async (q: { constraints: Constraint[] }) => {
    const rows = run(q.constraints);
    fakeDb.reads += rows.length;
    return { docs: rows.map(([id, data]) => ({ id, data: () => data })), size: rows.length };
  }),
  getCountFromServer: vi.fn(async (q: { constraints: Constraint[] }) => {
    const count = run(q.constraints).length;
    return { data: () => ({ count }) };
  }),
  getDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: FakeTimestamp,
};
