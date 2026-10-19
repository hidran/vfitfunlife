import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProviderBookingPage from './BookingClient';
import { itMessages } from '@/i18n/messages/it';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('providerId=biz'),
}));

vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    selectedProvider: null,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    availability: [],
    isLoadingAvailability: false,
    availabilityError: null,
    selectService: vi.fn(),
    selectDateTime: vi.fn(),
    fetchAvailability: vi.fn(),
    ensureSelectedProvider: vi.fn(),
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ firebaseUser: { uid: 'customer' }, isInitialized: true }),
}));

let mockProvider: Record<string, unknown>;
vi.mock('@/hooks/useProviders', () => ({
  useProvider: () => ({ data: mockProvider, isLoading: false }),
  useProviderServices: () => ({ data: [] }),
}));
vi.mock('@/hooks/useCommunity', () => ({ useInstructorReviews: () => ({ data: [] }) }));
vi.mock('@/hooks/useBookableDays', () => ({ useBookableDays: () => ({ data: undefined, isFetching: false }) }));
vi.mock('@/components/booking', () => ({ ServiceCard: () => null, AvailabilityPicker: () => null }));
vi.mock('@/components/gallery/PhotoGallery', () => ({ PhotoGallery: () => null }));

const base = {
  id: 'biz',
  fullName: 'Journey Fitness Torino',
  avatarUrl: 'https://img.example/owner.jpg',
  rating: 4.5,
  reviewCount: 3,
  isVerified: true,
  yearsOfExperience: 2,
  languages: [],
  specialties: [],
};

beforeEach(() => {
  mockProvider = { ...base, providerType: 'business', business: { displayName: 'Journey', logoUrl: 'https://img.example/logo.png' } };
});

describe('ProviderBookingPage header', () => {
  it('shows the Company badge next to Verified and the logo for a business', () => {
    render(<ProviderBookingPage />);

    expect(screen.getByText(itMessages['provider.badge.business'])).toBeInTheDocument();
    expect(screen.getByText(itMessages['booking.provider.verified'])).toBeInTheDocument();
    const logo = document.querySelector('img[src*="logo.png"]');
    expect(logo).not.toBeNull();
  });

  it('shows no Company badge for an individual', () => {
    mockProvider = { ...base, providerType: 'individual' };
    render(<ProviderBookingPage />);

    expect(screen.queryByText(itMessages['provider.badge.business'])).not.toBeInTheDocument();
  });
});
