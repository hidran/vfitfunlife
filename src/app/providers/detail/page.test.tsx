import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderProfilePage from './page';
import { itMessages } from '@/i18n/messages/it';
import { useBookingStore } from '@/stores/bookingStore';

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

let mockFirebaseUser: { uid: string } | null = { uid: 'customer-1' };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: unknown; isInitialized: boolean }) => unknown) =>
    selector({ firebaseUser: mockFirebaseUser, isInitialized: true }),
}));

// The booking sheet reads slots through the store, which imports these at module scope.
vi.mock('@/lib/firebookings', () => ({
  searchProviders: vi.fn(),
  getProviderAvailability: vi.fn(),
  createBooking: vi.fn(),
  getUserBookings: vi.fn(),
  getBooking: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  applyPromoCode: vi.fn(),
}));
vi.mock('@/hooks/useBookableDays', () => ({
  useBookableDays: () => ({ data: undefined, isFetching: false }),
}));
vi.mock('@/components/booking/AvailabilityPicker', () => ({
  AvailabilityPicker: () => <div data-testid="availability-picker" />,
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

  it('shows the not-found state when id is missing', () => {
    mockSearchParams = new URLSearchParams();
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<ProviderProfilePage />);
    expect(mockUseProfile).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('Anna Verdi')).not.toBeInTheDocument();
  });
});

describe('/providers/detail company page', () => {
  const base = {
    id: 'biz-1',
    fullName: 'Palestra Roma',
    avatarUrl: null,
    bio: null,
    providerProfile: null,
    socialLinks: null,
    isProvider: true,
    portfolioImages: [],
  };

  it('shows the badge, logo, description and a safe website link, never the legal data', () => {
    mockSearchParams = new URLSearchParams('id=biz-1');
    mockUseProfile.mockReturnValue({
      data: {
        ...base,
        business: {
          displayName: 'Palestra Roma',
          description: 'Sala pesi e corsi',
          website: 'https://palestra.it',
          logoUrl: 'https://cdn.x/logo.png',
        },
      },
      isLoading: false,
      error: null,
    });
    render(<ProviderProfilePage />);
    expect(screen.getByText('Azienda')).toBeInTheDocument();
    expect(screen.getByText('Sala pesi e corsi')).toBeInTheDocument();
    expect(screen.getByAltText('Palestra Roma')).toHaveAttribute('src', 'https://cdn.x/logo.png');
    const link = screen.getByRole('link', { name: /palestra\.it/ });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render a javascript: website and shows no badge for individuals', () => {
    mockSearchParams = new URLSearchParams('id=biz-1');
    mockUseProfile.mockReturnValue({
      data: { ...base, business: { displayName: 'X', website: 'javascript:alert(1)' } },
      isLoading: false,
      error: null,
    });
    const { unmount } = render(<ProviderProfilePage />);
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    mockUseProfile.mockReturnValue({ data: base, isLoading: false, error: null });
    render(<ProviderProfilePage />);
    expect(screen.queryByText('Azienda')).toBeNull();
  });
});

describe('/providers/detail social links', () => {
  const profileWith = (socialLinks: Record<string, string>) => ({
    data: {
      id: 'prov-42',
      fullName: 'Anna Verdi',
      avatarUrl: null,
      bio: null,
      providerProfile: { isVerified: true, rating: 0, reviewCount: 0, yearsOfExperience: 0, servicePricing: [] },
      socialLinks,
      isProvider: true,
      portfolioImages: [],
    },
    isLoading: false,
    error: null,
  });

  beforeEach(() => {
    mockSearchParams = new URLSearchParams('id=prov-42');
  });

  it('links http(s) social links but shows anything else as plain text', () => {
    mockUseProfile.mockReturnValue(
      profileWith({ website: 'javascript:alert(1)', linkedin: 'https://linkedin.com/in/anna' })
    );
    render(<ProviderProfilePage />);

    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
    const linkedin = screen.getByRole('link', { name: 'LinkedIn' });
    expect(linkedin).toHaveAttribute('href', 'https://linkedin.com/in/anna');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('builds the Instagram link with socialLinkHref and never links an unsafe value', () => {
    const handle = (() => {
      mockUseProfile.mockReturnValue(profileWith({ instagram: '@anna' }));
      return render(<ProviderProfilePage />);
    })();
    const link = screen.getByRole('link', { name: 'Instagram' });
    expect(link).toHaveAttribute('href', 'https://instagram.com/anna');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    handle.unmount();

    mockUseProfile.mockReturnValue(profileWith({ instagram: 'javascript:alert(1)' }));
    render(<ProviderProfilePage />);
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
  });

  it('does not link the Instagram pill to a foreign host', () => {
    mockUseProfile.mockReturnValue(profileWith({ instagram: 'https://instagram.com.evil.example/anna' }));
    render(<ProviderProfilePage />);
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
    expect(screen.getByText('https://instagram.com.evil.example/anna').closest('a')).toBeNull();
  });
});

describe('/providers/detail service booking', () => {
  const profileWithServices = () => ({
    data: {
      id: 'prov-42',
      fullName: 'Anna Verdi',
      avatarUrl: null,
      bio: null,
      providerProfile: {
        isVerified: true,
        rating: 0,
        reviewCount: 0,
        yearsOfExperience: 0,
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
          {
            id: 'group-service',
            serviceName: 'Lezione di gruppo',
            description: '',
            durationMinutes: 60,
            price: 15,
            isActive: true,
            kind: 'group',
            courseId: 'course-1',
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

  beforeEach(() => {
    window.history.replaceState(null, '', '/providers/detail/');
    mockSearchParams = new URLSearchParams('id=prov-42');
    mockFirebaseUser = { uid: 'customer-1' };
    useBookingStore.setState({
      selectedProvider: null,
      selectedService: null,
      selectedDate: null,
      selectedTime: null,
      availability: [],
      availabilityError: null,
    });
  });

  it('books a service from its own card, without going through /book', () => {
    mockUseProfile.mockReturnValue(profileWithServices());
    render(<ProviderProfilePage />);

    // Only the active, individually-booked service: a draft one is not offered and a group
    // service (a course) keeps its link to the course page.
    const bookButtons = screen.getAllByRole('button', {
      name: itMessages['providerProfile.bookService'],
    });
    expect(bookButtons).toHaveLength(1);
    expect(screen.getByRole('link', { name: itMessages['courses.sessions'] })).toHaveAttribute(
      'href',
      expect.stringContaining('course-1'),
    );

    fireEvent.click(bookButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Personal coaching' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('availability-picker')).toBeInTheDocument();
    // The confirm page reads this selection.
    expect(useBookingStore.getState().selectedProvider?.id).toBe('prov-42');
    expect(useBookingStore.getState().selectedService).toMatchObject({
      id: 'active-service',
      name: 'Personal coaching',
      price: 45,
      durationMinutes: 60,
    });
  });

  it('does not offer booking on the provider own page', () => {
    mockFirebaseUser = { uid: 'prov-42' };
    mockUseProfile.mockReturnValue(profileWithServices());
    render(<ProviderProfilePage />);

    expect(
      screen.queryByRole('button', { name: itMessages['providerProfile.bookService'] }),
    ).toBeNull();
  });

  it('reopens the service picked before signing in (…&service=)', () => {
    mockSearchParams = new URLSearchParams('id=prov-42&service=active-service');
    mockUseProfile.mockReturnValue(profileWithServices());
    render(<ProviderProfilePage />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Personal coaching' })).toBeInTheDocument();
    expect(useBookingStore.getState().selectedService?.id).toBe('active-service');
  });
});
