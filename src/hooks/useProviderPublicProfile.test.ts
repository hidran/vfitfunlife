import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { ProviderNotFoundError, useProviderPublicProfile } from './useProviderPublicProfile';
import { getProviderProfile, getUserData, isProvider } from '@/lib/firebase/auth';
import { getPortfolioImages } from '@/lib/firebase/storage';

vi.mock('@/lib/firebase/auth', () => ({
  isProvider: vi.fn(),
  getUserData: vi.fn(),
  getProviderProfile: vi.fn(),
}));
vi.mock('@/lib/firebase/storage', () => ({
  getPortfolioImages: vi.fn(),
}));

describe('useProviderPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the 4 independent reads in parallel and assembles the profile', async () => {
    vi.mocked(isProvider).mockResolvedValue(true);
    vi.mocked(getUserData).mockResolvedValue({
      fullName: 'Jane Trainer',
      avatarUrl: 'https://example.com/a.png',
      bio: 'Bio',
      socialLinks: { website: 'https://jane.example' },
    } as never);
    vi.mocked(getProviderProfile).mockResolvedValue({ rating: 4.8 } as never);
    vi.mocked(getPortfolioImages).mockResolvedValue(['img1.png', 'img2.png']);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('provider-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      id: 'provider-1',
      fullName: 'Jane Trainer',
      avatarUrl: 'https://example.com/a.png',
      bio: 'Bio',
      providerProfile: { rating: 4.8 },
      socialLinks: { website: 'https://jane.example' },
      isProvider: true,
      portfolioImages: ['img1.png', 'img2.png'],
    });
    // All 4 reads should have been issued (parallel), not just some.
    expect(isProvider).toHaveBeenCalledWith('provider-1');
    expect(getUserData).toHaveBeenCalledWith('provider-1');
    expect(getProviderProfile).toHaveBeenCalledWith('provider-1');
    expect(getPortfolioImages).toHaveBeenCalledWith('provider-1');
  });

  it('throws ProviderNotFoundError when the target is not a provider', async () => {
    vi.mocked(isProvider).mockResolvedValue(false);
    vi.mocked(getUserData).mockResolvedValue({ fullName: 'Someone' } as never);
    vi.mocked(getProviderProfile).mockResolvedValue(null);
    vi.mocked(getPortfolioImages).mockResolvedValue([]);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('not-a-provider'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('throws ProviderNotFoundError when the user doc is missing', async () => {
    vi.mocked(isProvider).mockResolvedValue(true);
    vi.mocked(getUserData).mockResolvedValue(null);
    vi.mocked(getProviderProfile).mockResolvedValue(null);
    vi.mocked(getPortfolioImages).mockResolvedValue([]);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile('missing-user'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ProviderNotFoundError);
  });

  it('does not fetch when providerId is undefined', () => {
    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(() => useProviderPublicProfile(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(isProvider).not.toHaveBeenCalled();
  });
});
