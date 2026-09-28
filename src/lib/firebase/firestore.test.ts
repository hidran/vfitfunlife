import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * countOrFallback/sumOrFallback exist because of a real finding while building P1-3/P1-4:
 * getCountFromServer()/getAggregateFromServer() can reject with FAILED_PRECONDITION (missing
 * composite index) for a query shape whose equivalent getDocs() already works fine — confirmed
 * live against staging for a `where(x,'==') + where(y,'in') + where(z,'>=')` shape, where an
 * existing index sorts the range field descending (fine for getDocs, not accepted by
 * aggregation) — and getAggregateFromServer's sum() additionally needs the summed field itself
 * in the index. Both helpers must fall back to computing the answer from getDocs() whenever the
 * aggregation call fails, so a missing/still-building index costs reads, not correctness.
 */

vi.mock('./config', () => ({ db: {} }));

type Doc = { data: () => Record<string, unknown> };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  getAggregateFromServer: vi.fn(),
  sum: vi.fn((field: string) => ({ kind: 'sum', field })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: class {},
  GeoPoint: class {},
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(),
}));

import { getDocs, getCountFromServer, getAggregateFromServer } from 'firebase/firestore';
import { countOrFallback, sumOrFallback } from './firestore';

const FAKE_QUERY = { kind: 'query' } as never;

function docsSnapshot(docs: Doc[]) {
  return {
    size: docs.length,
    forEach: (fn: (d: Doc) => void) => docs.forEach(fn),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Quiet the intentional console.error in the fallback path so test output stays clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('countOrFallback', () => {
  it('returns the aggregation count on success, without touching getDocs', async () => {
    vi.mocked(getCountFromServer).mockResolvedValue({ data: () => ({ count: 7 }) } as never);

    const result = await countOrFallback(FAKE_QUERY);

    expect(result).toBe(7);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('falls back to counting getDocs() results when the aggregation rejects', async () => {
    vi.mocked(getCountFromServer).mockRejectedValue(
      Object.assign(new Error('The query requires an index.'), { code: 'failed-precondition' })
    );
    vi.mocked(getDocs).mockResolvedValue(docsSnapshot([{ data: () => ({}) }, { data: () => ({}) }]));

    const result = await countOrFallback(FAKE_QUERY);

    expect(result).toBe(2);
  });
});

describe('sumOrFallback', () => {
  it('returns the aggregation sum on success, without touching getDocs', async () => {
    vi.mocked(getAggregateFromServer).mockResolvedValue({ data: () => ({ total: 150 }) } as never);

    const result = await sumOrFallback(FAKE_QUERY, 'amount');

    expect(result).toBe(150);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('treats a missing/undefined sum as zero, same as the `|| 0` it replaces', async () => {
    vi.mocked(getAggregateFromServer).mockResolvedValue({ data: () => ({ total: undefined }) } as never);

    expect(await sumOrFallback(FAKE_QUERY, 'amount')).toBe(0);
  });

  it('falls back to summing getDocs() results when the aggregation rejects', async () => {
    vi.mocked(getAggregateFromServer).mockRejectedValue(
      Object.assign(new Error('The query requires an index.'), { code: 'failed-precondition' })
    );
    vi.mocked(getDocs).mockResolvedValue(
      docsSnapshot([{ data: () => ({ amount: 50 }) }, { data: () => ({ amount: 30 }) }, { data: () => ({}) }])
    );

    const result = await sumOrFallback(FAKE_QUERY, 'amount');

    expect(result).toBe(80);
  });
});
