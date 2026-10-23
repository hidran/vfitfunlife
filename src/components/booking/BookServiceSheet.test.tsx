import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { itMessages } from '@/i18n/messages/it';
import type { ProviderSearchResult, Service } from '@/types/booking';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

let mockFirebaseUser: { uid: string } | null = { uid: 'customer-1' };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: unknown; isInitialized: boolean }) => unknown) =>
    selector({ firebaseUser: mockFirebaseUser, isInitialized: true }),
}));

// slot + store dependencies; the store itself stays real so the sheet's wiring is exercised.
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

import { getProviderAvailability } from '@/lib/firebookings';
import { useBookingStore } from '@/stores/bookingStore';
import { BookServiceSheet } from './BookServiceSheet';

const provider: ProviderSearchResult = {
  id: 'prov-42',
  fullName: 'Anna Verdi',
  rating: 4.8,
  reviewCount: 3,
  isVerified: true,
  specialties: ['Personal Training'],
  yearsOfExperience: 5,
  languages: ['it'],
  services: [],
};

const service: Service = {
  id: 'active-service',
  name: 'Personal coaching',
  description: 'Sessione individuale',
  durationMinutes: 60,
  price: 45,
  isActive: true,
};

const returnToPath = '/providers/detail?id=prov-42&service=active-service';
const renderSheet = () =>
  render(
    <BookServiceSheet
      provider={provider}
      service={service}
      returnToPath={returnToPath}
      onClose={vi.fn()}
    />,
  );

beforeEach(() => {
  push.mockReset();
  mockFirebaseUser = { uid: 'customer-1' };
  useBookingStore.setState({
    selectedProvider: null,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    availability: [],
    availabilityError: null,
    isLoadingAvailability: false,
  });
  vi.mocked(getProviderAvailability).mockReset();
  vi.mocked(getProviderAvailability).mockResolvedValue([
    { time: '10:00', startsAt: '2026-11-03T09:00:00.000Z', isAvailable: true, isBooked: false },
  ]);
});

describe('BookServiceSheet', () => {
  it('primes the booking flow with this provider and service', () => {
    renderSheet();

    expect(useBookingStore.getState().selectedProvider?.id).toBe('prov-42');
    expect(useBookingStore.getState().selectedService?.id).toBe('active-service');
  });

  it('picks a day and a time here, then hands over to the confirm screen', async () => {
    renderSheet();

    // An enabled day of the calendar on show (the picker disables padding days).
    const day = screen
      .getAllByRole('button')
      .find((button) => !button.hasAttribute('disabled') && /^\d+$/.test(button.textContent ?? ''));
    expect(day).toBeDefined();
    fireEvent.click(day as HTMLElement);

    // The slot comes from getProviderAvailability for the service's own id.
    const slot = await screen.findByRole('button', { name: '10:00' });
    await waitFor(() =>
      expect(getProviderAvailability).toHaveBeenCalledWith(
        'prov-42',
        'active-service',
        expect.any(Date),
        undefined,
      ),
    );
    fireEvent.click(slot);

    const next = screen.getByRole('button', { name: itMessages['booking.action.continue'] });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(push).toHaveBeenCalledWith('/booking/confirm');
    expect(useBookingStore.getState().selectedTime).toBe('10:00');
  });

  it('asks a signed-out visitor to sign in and comes back to this page', () => {
    mockFirebaseUser = null;
    renderSheet();

    expect(screen.getByText(itMessages['booking.availability.signInToSee'])).toBeInTheDocument();
    const signIn = screen.getByRole('link', { name: itMessages['booking.availability.signIn'] });
    expect(signIn).toHaveAttribute(
      'href',
      `/auth/login?next=${encodeURIComponent(returnToPath)}`,
    );
    // No dead calendar behind the prompt, and nothing to continue with yet.
    expect(screen.queryByText(itMessages['booking.services.selectDateTime'])).toBeNull();
    expect(
      screen.queryByRole('button', { name: itMessages['booking.action.continue'] }),
    ).toBeNull();
    expect(getProviderAvailability).not.toHaveBeenCalled();
  });
});
