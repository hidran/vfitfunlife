import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFallbackBooking } from '@/lib/bookingUtils';
import BookingDetailClient from './BookingDetailClient';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'b-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('id=b-1'),
}));

vi.mock('next/dynamic', () => ({ default: () => () => null }));

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({}) }));

vi.mock('@/lib/firebase/functions', () => ({ respondToPaymentConfirmation: vi.fn() }));

vi.mock('@/components/booking/PaymentConfirmationBanner', () => ({
  PaymentConfirmationBanner: () => null,
}));

vi.mock('@/stores/authStore', () => {
  const state = { user: { uid: 'client-1' }, refreshUserProfile: vi.fn() };
  return { useAuthStore: (select: (s: typeof state) => unknown) => select(state) };
});

const cancelBooking = vi.fn();
const updateBookingInList = vi.fn();
const updateCurrentBooking = vi.fn();
let booking: ReturnType<typeof buildFallbackBooking>;
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: (select: (s: unknown) => unknown) =>
    select({
      cancelBooking,
      userBookings: [booking],
      currentBooking: null,
      updateBookingInList,
      updateCurrentBooking,
      fetchUserBookings: vi.fn(),
    }),
}));

function openCancelDialog() {
  render(<BookingDetailClient />);
  fireEvent.click(screen.getByRole('button', { name: /annulla prenotazione/i }));
  return screen.getByRole('dialog', { name: 'Annulla prenotazione' });
}

describe('BookingDetailClient cancel dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Three days out: cancellable, not a late cancellation.
    const scheduled = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    booking = {
      ...buildFallbackBooking('b-1'),
      status: 'requested',
      location: undefined,
      scheduledAt: { toDate: () => scheduled } as never,
      scheduledEndAt: { toDate: () => new Date(scheduled.getTime() + 3600_000) } as never,
    };
  });

  it('is described by its body text', () => {
    const dialog = openCancelDialog();
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/Sei sicuro/);
  });

  it('shows a pending state and cannot be closed while the request is in flight', async () => {
    let finish!: () => void;
    cancelBooking.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const dialog = openCancelDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    const confirm = within(dialog).getByRole('button', { name: /Annullamento/ });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Mantieni' })).toBeDisabled();
    expect(cancelBooking).toHaveBeenCalledTimes(1);

    // Esc and a backdrop click are ignored while pending.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.previousElementSibling as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => finish());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateBookingInList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b-1', status: 'cancelled_by_client' })
    );
  });

  it('can be closed again after a failed request', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    cancelBooking.mockRejectedValue(new Error('boom'));
    const dialog = openCancelDialog();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    });
    expect(alert).toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Annulla' })).toBeEnabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    alert.mockRestore();
  });
});
