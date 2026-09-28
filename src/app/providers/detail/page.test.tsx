import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderProfilePage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const mockUseProfile = vi.fn();
vi.mock('@/hooks/useProviderPublicProfile', () => ({
  ProviderNotFoundError: class extends Error {},
  useProviderPublicProfile: (id: string | undefined) => mockUseProfile(id),
}));

describe('/providers/detail?id=', () => {
  beforeEach(() => {
    mockUseProfile.mockReset();
    window.history.replaceState(null, '', '/providers/detail/');
  });

  it('loads the provider named by the id query param', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    mockUseProfile.mockReturnValue({
      data: {
        id: 'prov-42',
        fullName: 'Anna Verdi',
        avatarUrl: null,
        bio: null,
        providerProfile: null,
        socialLinks: null,
        isProvider: true,
        portfolioImages: [],
      },
      isLoading: false,
      error: null,
    });
    render(<ProviderProfilePage />);
    expect(mockUseProfile).toHaveBeenCalledWith('prov-42');
    expect(screen.getAllByText('Anna Verdi').length).toBeGreaterThan(0);
  });

  it('shows the not-found state when id is missing', () => {
    mockSearchParams = new URLSearchParams();
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<ProviderProfilePage />);
    expect(mockUseProfile).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('Anna Verdi')).not.toBeInTheDocument();
  });
});
