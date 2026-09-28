import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({ cancelBooking: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', async () => (await import('./adminListFake.testutil')).firestoreFake);

import { where } from 'firebase/firestore';
import { fakeDb, seedUsers } from './adminListFake.testutil';
import { getPendingVerifications, getProviders, providerVerificationState } from './admin';

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

beforeEach(() => {
  vi.clearAllMocks();
  seedUsers({
    verifiedPro: {
      fullName: 'Vera Verificata',
      email: 'vera@example.com',
      role: 'provider',
      providerStatus: 'verified',
      providerProfile: { isVerified: true },
      createdAt: day(3),
    },
    // Legacy provider: no providerStatus at all, verified through the flat flag.
    legacyVerified: {
      fullName: 'Luca Legacy',
      email: 'luca@example.com',
      role: 'provider',
      isVerified: true,
      createdAt: day(1),
    },
    suspendedPro: {
      fullName: 'Sara Sospesa',
      email: 'sara@example.com',
      role: 'provider',
      providerProfile: { isVerified: true },
      isSuspended: true,
      createdAt: day(2),
    },
    // A provider no one has verified yet: pending, even with no providerStatus.
    unverifiedPro: {
      fullName: 'Ugo Nonverificato',
      email: 'ugo@example.com',
      role: 'provider',
      createdAt: day(4),
    },
    // Applicants stay role 'customer' until a decision — still listed as providers.
    applicant: {
      fullName: 'Paola Pendente',
      email: 'paola@example.com',
      role: 'customer',
      providerStatus: 'pending',
      createdAt: day(5),
    },
    rejectedApplicant: {
      fullName: 'Rita Respinta',
      email: 'rita@example.com',
      role: 'customer',
      providerStatus: 'rejected',
      createdAt: day(0),
    },
    plainCustomer: { fullName: 'Carlo Cliente', email: 'carlo@example.com', role: 'customer', createdAt: day(6) },
    hiddenPro: { fullName: 'Demo', email: 'demo@example.com', role: 'provider', isDeleted: true, createdAt: day(7) },
  });
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
    expect(where).toHaveBeenCalledWith('providerVerification', 'in', ['verified', 'pending', 'rejected']);
  });

  it('verification=pending includes applicants who are still customers', async () => {
    const result = await getProviders({ verificationStatus: 'pending' });

    expect(ids(result)).toEqual(['applicant', 'unverifiedPro']);
    expect(where).toHaveBeenCalledWith('providerVerification', '==', 'pending');
  });

  it('the pending filter and the verification queue name the same people', async () => {
    // getPendingVerifications reads by role/providerStatus (no derived field): the two
    // paths must still agree.
    const queue = (await getPendingVerifications()).map((p) => p.id).sort();
    const listed = ids(await getProviders({ verificationStatus: 'pending' })).sort();
    expect(listed).toEqual(queue);
  });

  it('verification=rejected shows only rejections, never pending ones', async () => {
    expect(ids(await getProviders({ verificationStatus: 'rejected' }))).toEqual(['rejectedApplicant']);
  });

  it('verification=verified keeps verified providers, including legacy flat-flag ones', async () => {
    expect(ids(await getProviders({ verificationStatus: 'verified' }))).toEqual([
      'verifiedPro',
      'suspendedPro',
      'legacyVerified',
    ]);
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

  it('searches name and email prefixes, case-insensitively', async () => {
    expect(ids(await getProviders({ search: 'PAOLA' }))).toEqual(['applicant']);
    expect(ids(await getProviders({ search: 'rita@' }))).toEqual(['rejectedApplicant']);
    expect(ids(await getProviders({ search: 'pend' }))).toEqual(['applicant']);
    expect(ids(await getProviders({ search: 'carlo' }))).toEqual([]); // a customer, not a provider
    expect(ids(await getProviders({ search: 'nobody' }))).toEqual([]);
  });

  it('pages server-side and reports the filtered total', async () => {
    fakeDb.reads = 0;
    const first = await getProviders({ page: 1, limit: 4 });
    expect(ids(first)).toEqual(['applicant', 'unverifiedPro', 'verifiedPro', 'suspendedPro']);
    expect(fakeDb.reads).toBe(4);

    fakeDb.reads = 0;
    const second = await getProviders({ page: 2, limit: 4 }, first.cursors);
    expect(ids(second)).toEqual(['legacyVerified', 'rejectedApplicant']);
    expect(second.total).toBe(6);
    expect(fakeDb.reads).toBe(2);
  });

  it('uses the doc id even when the data carries a stray id/uid', async () => {
    seedUsers({ real: { role: 'provider', fullName: 'Real', id: 'other', uid: 'other', createdAt: day(1) } });
    const [provider] = (await getProviders({})).providers;

    expect(provider.id).toBe('real');
    expect(provider.uid).toBe('real');
  });
});
