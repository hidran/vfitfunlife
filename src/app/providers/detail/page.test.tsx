import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderProfilePage from './page';
import { itMessages } from '@/i18n/messages/it';

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
        providerProfile: {
          servicePricing: [
            {
              id: 'active-service',
              serviceName: 'Personal coaching',
              description: 'Sessione individuale',
              durationMinutes: 60,
              price: 45,
              isActive: true,
            },
            {
              id: 'inactive-service',
              serviceName: 'Servizio bozza',
              description: '',
              durationMinutes: 30,
              price: 10,
              isActive: false,
            },
          ],
        },
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
    expect(screen.getByText('Personal coaching')).toBeInTheDocument();
    expect(screen.getByText('Sessione individuale')).toBeInTheDocument();
    expect(screen.queryByText('Servizio bozza')).not.toBeInTheDocument();
    expect(screen.getByText(/45,00.*€/)).toBeInTheDocument();
  });

  it('shows the company badge and logo in the header of a business provider', () => {
    mockSearchParams = new URLSearchParams('id=company-1');
    mockUseProfile.mockReturnValue({
      data: {
        id: 'company-1',
        fullName: 'Rossi Gym',
        avatarUrl: 'https://cdn/avatar.png',
        bio: null,
        providerType: 'business',
        business: { legalName: 'Rossi Fitness S.r.l.', vatNumber: '12345678901', displayName: 'Rossi Gym', logoUrl: 'https://cdn/logo.png' },
        providerProfile: { isVerified: true, rating: 0, reviewCount: 0, yearsOfExperience: 0, servicePricing: [] },
        socialLinks: null,
        isProvider: true,
        portfolioImages: [],
      },
      isLoading: false,
      error: null,
    });
    render(<ProviderProfilePage />);
    expect(screen.getByText(itMessages['provider.badge.business'])).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Rossi Gym' })).toHaveAttribute('src', 'https://cdn/logo.png');
  });

  it('links http(s) social links but shows anything else as plain text', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    mockUseProfile.mockReturnValue({
      data: {
        id: 'prov-42',
        fullName: 'Anna Verdi',
        avatarUrl: null,
        bio: null,
        providerProfile: { isVerified: true, rating: 0, reviewCount: 0, yearsOfExperience: 0, servicePricing: [] },
        socialLinks: { website: 'javascript:alert(1)', linkedin: 'https://linkedin.com/in/anna' },
        isProvider: true,
        portfolioImages: [],
      },
      isLoading: false,
      error: null,
    });
    render(<ProviderProfilePage />);

    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
    const linkedin = screen.getByRole('link', { name: 'LinkedIn' });
    expect(linkedin).toHaveAttribute('href', 'https://linkedin.com/in/anna');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
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
