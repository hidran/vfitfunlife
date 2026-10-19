import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingConfirmPage from './page';
import { itMessages } from '@/i18n/messages/it';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'client-1', pointsBalance: 0, walletBalance: 0 } }),
}));

let mockProvider: Record<string, unknown>;
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    selectedProvider: mockProvider,
    selectedService: { id: 'svc-1', name: 'Personal Training', price: 50, durationMinutes: 60 },
    selectedDate: new Date('2026-10-05T00:00:00'),
    selectedTime: '10:00',
    availability: [{ time: '10:00', startsAt: '2026-10-05T08:00:00.000Z', isAvailable: true }],
    appliedPromo: null,
    isApplyingPromo: false,
    createBooking: vi.fn(),
    applyPromoCode: vi.fn(),
    clearPromoCode: vi.fn(),
  }),
}));

describe('booking confirm — company provider', () => {
  beforeEach(() => {
    mockProvider = { id: 'biz', fullName: 'Journey Fitness', avatarUrl: 'https://img.example/owner.jpg', location: null };
  });

  it('shows the company badge and its logo instead of the owner avatar', () => {
    mockProvider = { ...mockProvider, isBusiness: true, logoUrl: 'https://img.example/logo.png' };
    render(<BookingConfirmPage />);

    expect(screen.getByText(itMessages['provider.badge.business'])).toBeInTheDocument();
    expect(document.querySelector('img[src*="logo.png"]')).not.toBeNull();
    expect(document.querySelector('img[src*="owner.jpg"]')).toBeNull();
  });

  it('shows no badge and the avatar for an individual', () => {
    render(<BookingConfirmPage />);

    expect(screen.queryByText(itMessages['provider.badge.business'])).not.toBeInTheDocument();
    expect(document.querySelector('img[src*="owner.jpg"]')).not.toBeNull();
  });
});
