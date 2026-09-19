import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({ cancelBooking: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: class {},
  startAfter: vi.fn(),
  writeBatch: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import { getUsers } from './admin';

function snapshotOf(users: Record<string, Record<string, unknown>>) {
  return {
    docs: Object.entries(users).map(([id, data]) => ({ id, data: () => data })),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocs).mockResolvedValue(
    snapshotOf({
      alive: { fullName: 'Anna Attiva', email: 'anna@example.com' },
      banned: { fullName: 'Bruno Sospeso', email: 'bruno@example.com', isSuspended: true },
      gone: { fullName: 'Demo Presentazione', email: 'demo@example.com', isDeleted: true },
    })
  );
});

describe('getUsers', () => {
  it('drops soft-deleted accounts, as every other admin list does', async () => {
    const { users, total } = await getUsers({});

    expect(users.map((u) => u.id)).toEqual(['alive', 'banned']);
    expect(total).toBe(2);
  });

  it('applies the status filter', async () => {
    expect((await getUsers({ status: 'suspended' })).users.map((u) => u.id)).toEqual(['banned']);
    expect((await getUsers({ status: 'active' })).users.map((u) => u.id)).toEqual(['alive']);
  });
});
