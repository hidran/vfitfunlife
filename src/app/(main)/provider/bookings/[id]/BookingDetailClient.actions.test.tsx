import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { ProviderBooking } from '@/types/provider';
import { chatHref } from '@/lib/routes';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  booking: null as ProviderBooking | null,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'b-1' }),
  useRouter: () => ({ push: mocks.push, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('id=b-1'),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: null }) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: { uid: string } }) => unknown) => select({ user: { uid: 'trainer-1' } }),
}));
vi.mock('@/stores/providerStore', () => ({
  useProviderStore: (select: (state: Record<string, unknown>) => unknown) => select({
    bookings: mocks.booking ? [mocks.booking] : [],
    isLoadingBookings: false,
    bookingError: null,
    fetchBookings: vi.fn(),
    confirmBooking: vi.fn(),
    declineBooking: vi.fn(),
    completeBooking: vi.fn(),
    markBookingNoShow: vi.fn(),
    cancelBooking: vi.fn(),
    confirmBookingPayment: vi.fn(),
  }),
}));
vi.mock('@/lib/firebase/functions', () => ({ updateBookingPrivateNotes: vi.fn() }));
vi.mock('@/lib/firebase/provider', () => ({ findClientIdForUser: vi.fn() }));
vi.mock('@/components/provider/RecordPaymentSheet', () => ({ RecordPaymentSheet: () => null }));
vi.mock('@/components/provider/CancelBookingDialog', () => ({ CancelBookingDialog: () => null }));

import BookingDetailClient from './BookingDetailClient';

const makeBooking = (): ProviderBooking => ({
  id: 'b-1',
  userId: 'client-1',
  userName: 'Client One',
  userPhone: '+390000000',
  userEmail: 'client@example.test',
  clientPhotoUrl: undefined,
  venueId: 'venue-1',
  venueName: 'VFit Studio',
  venueAddress: 'Via Roma',
  serviceId: 'service-1',
  serviceName: 'Personal training',
  instructorId: 'trainer-1',
  instructorName: 'Trainer One',
  bookingType: 'in_venue',
  serviceAddress: null,
  scheduledAt: Timestamp.fromDate(new Date('2026-10-10T10:00:00.000Z')),
  scheduledEndAt: Timestamp.fromDate(new Date('2026-10-10T11:00:00.000Z')),
  durationMinutes: 60,
  status: 'accepted',
  originalPrice: 75,
  discountAmount: 0,
  homeServiceFee: 0,
  finalPrice: 75,
  depositAmount: 0,
  depositPaid: false,
  pointsEarned: 0,
  pointsUsed: 0,
  pointsValue: 0,
  promotionId: null,
  promotionCode: null,
  paymentStatus: 'pending',
  paymentMethod: null,
  stripePaymentIntentId: null,
  userNotes: null,
  internalNotes: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  refundAmount: null,
  statusHistory: [],
  hasReviewed: false,
  reviewId: null,
  createdAt: Timestamp.fromDate(new Date('2026-10-01T10:00:00.000Z')),
  updatedAt: Timestamp.fromDate(new Date('2026-10-01T10:00:00.000Z')),
  confirmedAt: null,
  completedAt: null,
  isReviewed: false,
});

describe('provider booking detail actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.booking = makeBooking();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens a chat with the booking client and includes booking context', () => {
    render(<BookingDetailClient />);

    fireEvent.click(screen.getByRole('button', { name: 'provider.bookingDetail.messageClient' }));

    expect(mocks.push).toHaveBeenCalledWith(chatHref('client-1', {
      name: 'Client One',
      photoUrl: null,
      bookingId: 'b-1',
    }));
  });

  it('downloads a booking record when Download Invoice is clicked', () => {
    const objectUrl = 'blob:booking-invoice';
    const createObjectURL = vi.fn((_blob: Blob) => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    render(<BookingDetailClient />);

    fireEvent.click(screen.getByRole('button', { name: 'provider.bookingDetail.downloadInvoice' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const downloadedBlob = createObjectURL.mock.calls[0][0];
    expect(downloadedBlob.type).toBe('text/html;charset=utf-8');
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });
});
