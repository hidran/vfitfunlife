import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { ProviderNotFoundError, useProviderPublicProfile } from './useProviderPublicProfile';
import { collection, getDoc, getDocs } from 'firebase/firestore';
import { getPortfolioImages } from '@/lib/firebase/storage';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));
vi.mock('@/lib/firebase/storage', () => ({ getPortfolioImages: vi.fn() }));

function snap(id: string, data: Record<string, unknown> | null) {
  return { id, exists: () => data !== null, data: () => data } as never;
}

function serviceDocs(services: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: services.map((service) => ({ id: service.id, data: () => service.data })) } as never;
}

describe('useProviderPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPortfolioImages).mockResolvedValue([]);
    vi.mocked(getDocs).mockResolvedValue(serviceDocs([]));
  });

  it('reads the public instructor catalog and normalizes its profile fields', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('provider-1', {
      fullName: 'Jane Trainer',
      avatarUrl: 'https://example.com/a.png',
      experienceYears: 5,
      socialLinks: { website: 'https://jane.example' },
      providerProfile: { bio: 'Bio', isVerified: true, rating: 4.8, reviewCount: 3, specialties: ['yoga'] },
    }));
    vi.mocked(getPortfolioImages).mockResolvedValue(['img1.png']);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('provider-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(getDoc).mock.calls[0][0]).toEqual({ path: 'instructors/provider-1' });
    expect(result.current.data).toMatchObject({
      fullName: 'Jane Trainer',
      bio: 'Bio',
      portfolioImages: ['img1.png'],
      socialLinks: { website: 'https://jane.example' },
      providerProfile: {
        professionalBio: 'Bio',
        isVerified: true,
        rating: 4.8,
        reviewCount: 3,
        yearsOfExperience: 5,
        specialties: ['yoga'],
        certifications: [],
        languages: [],
        servicePricing: [],
      },
    });
  });

  it('exposes a company\'s type and details so the page can show its badge and logo', async () => {
    const business = { legalName: 'Rossi Fitness S.r.l.', vatNumber: '12345678901', displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' };
    vi.mocked(getDoc).mockResolvedValue(snap('company-1', {
      fullName: 'Rossi Gym', providerType: 'business', business, providerProfile: { isVerified: true },
    }));

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('company-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.providerType).toBe('business');
    expect(result.current.data?.business).toEqual({ displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' });
  });

  it('loads the actual booking services so the public profile can list active offers', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('provider-1', {
      fullName: 'Jane Trainer',
      providerProfile: { isVerified: true, servicePricing: [{ id: 'legacy', serviceName: 'Old offer', price: 5, durationMinutes: 30, isActive: true }] },
    }));
    vi.mocked(getDocs).mockResolvedValue(serviceDocs([
      { id: 'active-service', data: { name: 'Personal coaching', description: 'One-to-one session', price: 45, durationMinutes: 60, isActive: true } },
      { id: 'inactive-service', data: { name: 'Draft session', price: 10, durationMinutes: 30, isActive: false } },
    ]));

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('provider-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(collection).mock.calls[0]).toEqual([{}, 'instructors', 'provider-1', 'services']);
    expect(result.current.data?.providerProfile?.servicePricing).toEqual([
      { id: 'active-service', serviceName: 'Personal coaching', description: 'One-to-one session', price: 45, durationMinutes: 60, isActive: true },
      { id: 'inactive-service', serviceName: 'Draft session', description: '', price: 10, durationMinutes: 30, isActive: false },
    ]);
  });

  it('throws ProviderNotFoundError when the instructor doc is missing', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap('missing', null));
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('missing'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('treats a rules denial as not found and rejects venue activities', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('pending'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);

    vi.mocked(getDoc).mockResolvedValue(snap('event', { name: 'Party', activityKind: 'event' }));
    const second = renderHook(() => useProviderPublicProfile('event'), { wrapper });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('does not fetch without a provider id', () => {
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getDoc).not.toHaveBeenCalled();
  });
});
