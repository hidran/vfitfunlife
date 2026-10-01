import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPrice } from '@/lib/utils';
import BookingConfirmPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

const auth = vi.hoisted(() => ({
  user: { id: 'client-1', pointsBalance: 0, walletBalance: 0, isVip: false } as Record<string, unknown>,
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: auth.user }) }));

const store = vi.hoisted(() => ({ appliedPromo: null as unknown }));
const createBooking = vi.fn();
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    selectedProvider: { id: 'trainer-1', fullName: 'Coach Marco', avatarUrl: null, location: null },
    selectedService: { id: 'svc-1', name: 'Personal Training', price: 50, durationMinutes: 60 },
    selectedDate: new Date('2026-10-05T00:00:00'),
    selectedTime: '10:00',
    availability: [{ time: '10:00', startsAt: '2026-10-05T08:00:00.000Z', isAvailable: true }],
    appliedPromo: store.appliedPromo,
    isApplyingPromo: false,
    createBooking,
    applyPromoCode: vi.fn(),
    clearPromoCode: vi.fn(),
  }),
}));

/** The bottom bar's total — what the client is told they will pay the trainer. */
function shownTotal() {
  const label = screen.getAllByText('Totale').at(-1)!;
  return label.nextElementSibling?.textContent;
}

function confirm() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Termini di servizio/ }));
  fireEvent.click(screen.getAllByRole('button').at(-1)!);
}

describe('booking confirm — honest checkout (B3)', () => {
  beforeEach(() => {
    auth.user = { id: 'client-1', pointsBalance: 0, walletBalance: 0, isVip: false };
    store.appliedPromo = null;
    createBooking.mockReset();
    createBooking.mockResolvedValue({ id: 'b-1' });
  });

  it('shows the service price as the total — no platform fee, no saved cards', () => {
    render(<BookingConfirmPage />);
    expect(shownTotal()).toBe(formatPrice(50, 'it'));
    expect(screen.queryByText(/commissione/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/4242|8888/)).not.toBeInTheDocument();
  });

  it('explains that the trainer is paid directly and that confirming earns XP', () => {
    render(<BookingConfirmPage />);
    const box = screen.getByTestId('pay-trainer');
    expect(within(box).getByText(/direttamente al trainer/)).toBeInTheDocument();
    expect(within(box).getByText(/\+50 XP/)).toBeInTheDocument();
  });

  it('applies a promo the way the server does (percentage, capped)', () => {
    store.appliedPromo = { code: 'SAVE20', type: 'percentage', value: 20, maxDiscount: 5 };
    render(<BookingConfirmPage />);
    expect(shownTotal()).toBe(formatPrice(45, 'it'));
  });

  it('"use my points" is a toggle that uses what the server will use', async () => {
    auth.user = { id: 'client-1', pointsBalance: 1250, walletBalance: 0, isVip: false };
    render(<BookingConfirmPage />);
    expect(shownTotal()).toBe(formatPrice(50, 'it'));

    fireEvent.click(screen.getByRole('switch', { name: /Usa i miei punti/ }));
    expect(shownTotal()).toBe(formatPrice(37.5, 'it'));

    confirm();
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(createBooking.mock.calls[0][0]).toMatchObject({ pointsToUse: 1250 });
  });

  it('sends no points when the toggle is off', async () => {
    auth.user = { id: 'client-1', pointsBalance: 1250, walletBalance: 0, isVip: false };
    render(<BookingConfirmPage />);
    confirm();
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(createBooking.mock.calls[0][0]).toMatchObject({ pointsToUse: 0 });
  });
});
