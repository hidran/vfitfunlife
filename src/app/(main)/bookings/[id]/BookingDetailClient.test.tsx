import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '@/types/booking';
import BookingDetailPage from './BookingDetailClient';

const mocks = vi.hoisted(() => ({
  cancelBooking: vi.fn(),
  updateBookingInList: vi.fn(),
  updateCurrentBooking: vi.fn(),
  booking: null as Booking | null,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'b-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('id=b-1'),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isLoading: false }) }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    locale: 'it',
    t: (key: string) => ({
      'bookings.detail.cancelModal.title': 'Annulla prenotazione',
      'bookings.detail.cancelModal.body': 'Sei sicuro di voler annullare questa prenotazione?',
      'bookings.detail.cancelModal.keep': 'Mantieni',
      'bookings.detail.cancelModal.cancelling': 'Annullamento…',
      'common.cancel': 'Annulla',
      'bookings.detail.errorCancel': 'Errore durante l’annullamento',
      'booking.card.cancelAriaLabel': 'Annulla prenotazione',
    }[key] ?? key),
  }),
}));
vi.mock('@/lib/firebase/functions', () => ({ respondToPaymentConfirmation: vi.fn() }));
vi.mock('@/components/booking/PaymentConfirmationBanner', () => ({ PaymentConfirmationBanner: () => null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: { user: { uid: string }; refreshUserProfile: () => Promise<void> }) => unknown) => {
    const state = { user: { uid: 'client-1' }, refreshUserProfile: vi.fn() };
    return selector ? selector(state) : state;
  },
}));
vi.mock('@/stores/bookingStore', () => {
  const store = {
    fetchBooking: vi.fn(async () => null),
    getState: () => store,
  };
  return {
    useBookingStore: (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        cancelBooking: mocks.cancelBooking,
        userBookings: mocks.booking ? [mocks.booking] : [],
        currentBooking: null,
        updateBookingInList: mocks.updateBookingInList,
        updateCurrentBooking: mocks.updateCurrentBooking,
        fetchUserBookings: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    useShallow: (selector: (state: unknown) => unknown) => selector,
    getState: store.getState,
  };
});

const makeTimestamp = (date: Date) => Timestamp.fromDate(date);

function makeBooking(): Booking {
  const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return {
    id: 'b-1',
    userId: 'client-1',
    providerId: 'trainer-1',
    serviceId: 'service-1',
    serviceName: 'Personal training',
    providerName: 'Trainer One',
    instructorId: 'trainer-1',
    instructorName: 'Trainer One',
    scheduledAt: makeTimestamp(scheduledAt),
    scheduledEndAt: makeTimestamp(new Date(scheduledAt.getTime() + 60 * 60 * 1000)),
    duration: 60,
    locationType: 'in_person',
    servicePrice: 60,
    platformFee: 3,
    discountAmount: 0,
    pointsUsed: 0,
    totalPrice: 63,
    status: 'requested',
    paymentStatus: 'pending',
    hasReviewed: false,
    createdAt: makeTimestamp(new Date()),
    updatedAt: makeTimestamp(new Date()),
  };
}

function openCancelDialog() {
  render(<BookingDetailPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Annulla prenotazione' }));
  return screen.getByRole('dialog', { name: 'Annulla prenotazione' });
}

describe('BookingDetailPage cancel dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.booking = makeBooking();
  });

  it('is described by its body text', () => {
    const dialog = openCancelDialog();
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/Sei sicuro/);
  });

  it('shows a pending state and cannot be closed while the request is in flight', async () => {
    let finish!: () => void;
    mocks.cancelBooking.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const dialog = openCancelDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    const confirm = within(dialog).getByRole('button', { name: /Annullamento/ });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Mantieni' })).toBeDisabled();
    expect(mocks.cancelBooking).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.previousElementSibling as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => finish());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.updateBookingInList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b-1', status: 'cancelled_by_client' }),
    );
  });

  it('can be closed again after a failed request', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    mocks.cancelBooking.mockRejectedValue(new Error('boom'));
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
