import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { useBookingStore } from './bookingStore';
import { providerSearchResultFromProvider } from '@/lib/bookingProvider';
import type { Provider } from '@/types/instructor';
import type { Service } from '@/types/booking';

const provider = (id: string, extra: Partial<Provider> = {}): Provider => ({
  id,
  fullName: `Trainer ${id}`,
  avatarUrl: null,
  rating: 4.8,
  reviewCount: 12,
  isVerified: true,
  isActive: true,
  specialties: ['Yoga'],
  yearsOfExperience: 5,
  languages: ['it'],
  ...extra,
});

const service = { id: 's1', name: 'Yoga 1:1', price: 50, durationMinutes: 60 } as Service;

beforeEach(() => {
  useBookingStore.setState({
    selectedProvider: null,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
  });
});

describe('providerSearchResultFromProvider', () => {
  it('maps a profile to the booking shape, with a location only when it has coordinates', () => {
    const withCoords = providerSearchResultFromProvider(
      provider('p1', { lat: 45.46, lng: 9.19, city: 'Milano', avatarUrl: 'a.jpg' })
    );
    expect(withCoords).toMatchObject({
      id: 'p1',
      fullName: 'Trainer p1',
      avatarUrl: 'a.jpg',
      services: [],
      location: { lat: 45.46, lng: 9.19, address: 'Milano' },
    });

    const noCoords = providerSearchResultFromProvider(provider('p2'));
    expect(noCoords.location).toBeUndefined();
    expect(noCoords.avatarUrl).toBeUndefined();
  });
});

describe('bookingStore.ensureSelectedProvider', () => {
  it('selects the provider /book loaded, so the confirm page has one (profile entry point)', () => {
    useBookingStore.getState().ensureSelectedProvider(providerSearchResultFromProvider(provider('p1')));
    expect(useBookingStore.getState().selectedProvider?.id).toBe('p1');
  });

  it('keeps the service and slot already chosen for the same provider', () => {
    const date = new Date(2026, 9, 1);
    const store = useBookingStore.getState();
    store.ensureSelectedProvider(providerSearchResultFromProvider(provider('p1')));
    store.selectService(service);
    store.selectDateTime(date, '10:00');

    useBookingStore.getState().ensureSelectedProvider(providerSearchResultFromProvider(provider('p1')));

    const s = useBookingStore.getState();
    expect(s.selectedService?.id).toBe('s1');
    expect(s.selectedDate).toBe(date);
    expect(s.selectedTime).toBe('10:00');
  });

  it("drops another provider's leftover service and slot", () => {
    useBookingStore.setState({
      selectedProvider: providerSearchResultFromProvider(provider('old')),
      selectedService: service,
      selectedDate: new Date(),
      selectedTime: '10:00',
    });

    useBookingStore.getState().ensureSelectedProvider(providerSearchResultFromProvider(provider('p1')));

    const s = useBookingStore.getState();
    expect(s.selectedProvider?.id).toBe('p1');
    expect(s.selectedService).toBeNull();
    expect(s.selectedTime).toBeNull();
  });
});
