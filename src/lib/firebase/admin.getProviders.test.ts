import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({ cancelBooking: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

type Where = { field: string; op: string; value: unknown };
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  // The fake query is just its constraints; getDocs below evaluates them against `docs`.
  query: vi.fn((_ref: unknown, ...constraints: Where[]) => ({ constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
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

import { getDocs, where } from 'firebase/firestore';
import { getProviders, providerVerificationState } from './admin';

let docs: Record<string, Record<string, unknown>> = {};

function matches(data: Record<string, unknown>, c: Where): boolean {
  const actual = data[c.field];
  if (c.op === '==') return actual === c.value;
  if (c.op === 'in') return (c.value as unknown[]).includes(actual);
  throw new Error(`unsupported op ${c.op}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = {
    verifiedPro: {
      fullName: 'Vera Verificata',
      email: 'vera@example.com',
      role: 'provider',
      providerStatus: 'verified',
      providerProfile: { isVerified: true },
      createdAt: new Date('2026-01-03'),
    },
    // Legacy provider: no providerStatus at all, verified through the flat flag.
    legacyVerified: {
      fullName: 'Luca Legacy',
      email: 'luca@example.com',
      role: 'provider',
      isVerified: true,
      createdAt: new Date('2026-01-01'),
    },
    suspendedPro: {
      fullName: 'Sara Sospesa',
      email: 'sara@example.com',
      role: 'provider',
      providerProfile: { isVerified: true },
      isSuspended: true,
      createdAt: new Date('2026-01-02'),
    },
    // A provider no one has verified yet: pending, even with no providerStatus.
    unverifiedPro: {
      fullName: 'Ugo Nonverificato',
      email: 'ugo@example.com',
      role: 'provider',
      createdAt: new Date('2026-01-04'),
    },
    // Applicants stay role 'customer' until a decision — the rows the role query never saw.
    applicant: {
      fullName: 'Paola Pendente',
      email: 'paola@example.com',
      role: 'customer',
      providerStatus: 'pending',
      createdAt: new Date('2026-01-05'),
    },
    rejectedApplicant: {
      fullName: 'Rita Respinta',
      email: 'rita@example.com',
      role: 'customer',
      providerStatus: 'rejected',
      // No createdAt: must still show up, sorted last.
    },
    plainCustomer: { fullName: 'Carlo Cliente', email: 'carlo@example.com', role: 'customer' },
    hiddenPro: {
      fullName: 'Demo',
      email: 'demo@example.com',
      role: 'provider',
      isDeleted: true,
    },
  };
  vi.mocked(getDocs).mockImplementation((async (q: { constraints: Where[] }) => ({
    docs: Object.entries(docs)
      .filter(([, data]) => q.constraints.every((c) => matches(data, c)))
      .map(([id, data]) => ({ id, data: () => data })),
  })) as never);
});

const ids = (r: { providers: { id: string }[] }) => r.providers.map((p) => p.id);

describe('providerVerificationState', () => {
  it('lets providerStatus decide before the verified flag', () => {
    expect(providerVerificationState({ role: 'customer', providerStatus: 'rejected' })).toBe('rejected');
    expect(providerVerificationState({ role: 'provider', providerStatus: 'rejected' })).toBe('rejected');
    expect(providerVerificationState({ role: 'customer', providerStatus: 'pending' })).toBe('pending');
    expect(providerVerificationState({ role: 'provider' })).toBe('pending');
    expect(providerVerificationState({ role: 'provider', isVerified: true })).toBe('verified');
  });
});

describe('getProviders', () => {
  it('lists providers and applicants, newest first, without hidden accounts or plain customers', async () => {
    const result = await getProviders({});

    expect(ids(result)).toEqual([
      'applicant',
      'unverifiedPro',
      'verifiedPro',
      'suspendedPro',
      'legacyVerified',
      'rejectedApplicant',
    ]);
    expect(result.total).toBe(6);
  });

  it('verification=pending includes applicants who are still customers', async () => {
    const result = await getProviders({ verificationStatus: 'pending' });

    expect(ids(result)).toEqual(['applicant', 'unverifiedPro']);
    expect(where).toHaveBeenCalledWith('providerStatus', 'in', ['pending']);
  });

  it('verification=rejected shows only rejections, never pending ones', async () => {
    const result = await getProviders({ verificationStatus: 'rejected' });

    expect(ids(result)).toEqual(['rejectedApplicant']);
    // Rejected applicants are not providers: the role query is not needed at all.
    expect(where).not.toHaveBeenCalledWith('role', '==', 'provider');
  });

  it('verification=verified keeps verified providers, including legacy flat-flag ones', async () => {
    const result = await getProviders({ verificationStatus: 'verified' });

    expect(ids(result)).toEqual(['verifiedPro', 'suspendedPro', 'legacyVerified']);
    expect(where).not.toHaveBeenCalledWith('providerStatus', 'in', expect.anything());
  });

  it('applies the status filter with the same semantics as getUsers', async () => {
    expect(ids(await getProviders({ status: 'suspended' }))).toEqual(['suspendedPro']);
    expect(ids(await getProviders({ status: 'active' }))).not.toContain('suspendedPro');
    expect(ids(await getProviders({ status: 'active' }))).toHaveLength(5);
  });

  it('combines status and verification filters', async () => {
    expect(ids(await getProviders({ status: 'active', verificationStatus: 'verified' }))).toEqual([
      'verifiedPro',
      'legacyVerified',
    ]);
  });

  it('searches name and email, case-insensitively', async () => {
    expect(ids(await getProviders({ search: 'PAOLA' }))).toEqual(['applicant']);
    expect(ids(await getProviders({ search: 'rita@' }))).toEqual(['rejectedApplicant']);
    expect(ids(await getProviders({ search: 'nobody' }))).toEqual([]);
  });

  it('paginates after filtering and reports the filtered total', async () => {
    const result = await getProviders({ page: 2, limit: 4 });

    expect(ids(result)).toEqual(['legacyVerified', 'rejectedApplicant']);
    expect(result.total).toBe(6);
  });

  it('uses the doc id even when the data carries a stray id/uid', async () => {
    docs = { real: { role: 'provider', fullName: 'Real', id: 'other', uid: 'other' } };
    const [provider] = (await getProviders({})).providers;

    expect(provider.id).toBe('real');
    expect(provider.uid).toBe('real');
  });
});
