import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { ProviderNotFoundError, toProviderPublicProfile, useProviderPublicProfile } from './useProviderPublicProfile';
import { getDoc } from 'firebase/firestore';
import { getPortfolioImages } from '@/lib/firebase/storage';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(),
}));
vi.mock('@/lib/firebase/storage', () => ({
  getPortfolioImages: vi.fn(),
}));

function snap(id: string, data: Record<string, unknown> | null) {
  return { id, exists: () => data !== null, data: () => data } as never;
}

describe('useProviderPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPortfolioImages).mockResolvedValue([]);
  });

  it('reads the public instructors/{id} catalog doc and normalizes it', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      snap('provider-1', {
        fullName: 'Jane Trainer',
        avatarUrl: 'https://example.com/a.png',
        experienceYears: 5,
        socialLinks: { website: 'https://jane.example' },
        providerProfile: { bio: 'Bio', isVerified: true, rating: 4.8, reviewCount: 3, specialties: ['yoga'] },
      }),
    );
    vi.mocked(getPortfolioImages).mockResolvedValue(['img1.png']);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('provider-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(vi.mocked(getDoc).mock.calls[0][0]).toEqual({ path: 'instructors/provider-1' });
    expect(data.fullName).toBe('Jane Trainer');
    expect(data.bio).toBe('Bio');
    expect(data.portfolioImages).toEqual(['img1.png']);
    expect(data.socialLinks).toEqual({ website: 'https://jane.example' });
    expect(data.providerProfile).toMatchObject({
      professionalBio: 'Bio',
      isVerified: true,
      rating: 4.8,
      reviewCount: 3,
      yearsOfExperience: 5,
      specialties: ['yoga'],
      certifications: [],
      languages: [],
    });
  });

  it('throws ProviderNotFoundError when the doc is missing', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('missing', null));
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('missing'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('treats a rules denial (unverified provider) as not found', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('pending'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('rejects venue activities that share the collection', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('evt', { name: 'Party', activityKind: 'event' }));
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('evt'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('does not fetch when providerId is undefined', () => {
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe('toProviderPublicProfile company data', () => {
  it('exposes only the public business fields', () => {
    const p = toProviderPublicProfile(
      'b',
      {
        fullName: 'Acme',
        business: { legalName: 'Acme Srl', vatNumber: '12345678903', displayName: 'Acme', website: 'https://acme.it' },
      },
      [],
    );
    expect(p.business).toEqual({ displayName: 'Acme', website: 'https://acme.it' });
  });

  it('leaves individuals without a business key', () => {
    expect('business' in toProviderPublicProfile('i', { fullName: 'Jane', providerType: 'business' }, [])).toBe(false);
  });
});
