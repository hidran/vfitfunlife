import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingReviewClient from './BookingReviewClient';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams('id=b-1'),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const submitReview = vi.fn();
vi.mock('@/lib/firebase/functions', () => ({
  submitReview: (data: unknown) => submitReview(data),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'client-1' } }),
}));

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const updateBookingInList = vi.fn();
const updateCurrentBooking = vi.fn();
const fetchBooking = vi.fn();
let booking: Record<string, unknown>;
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    userBookings: [booking],
    currentBooking: null,
    fetchBooking,
    updateBookingInList,
    updateCurrentBooking,
  }),
}));

function fillAndSubmit() {
  // aria-label of the 4th star
  const stars = screen.getAllByRole('button', { pressed: false }).filter((b) => b.querySelector('svg'));
  fireEvent.click(stars[3]);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sessione ottima, consigliato' } });
  const submit = screen.getAllByRole('button').at(-1)!;
  fireEvent.click(submit);
}

describe('BookingReviewClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    booking = {
      id: 'b-1',
      userId: 'client-1',
      instructorId: 'trainer-1',
      instructorName: 'Coach Marco',
      serviceName: 'Personal Training',
      status: 'payment_confirmed',
      hasReviewed: false,
      scheduledAt: ts('2026-09-20T10:00:00Z'),
    };
  });

  it('submits the review through the callable and marks the booking reviewed', async () => {
    submitReview.mockResolvedValue({ reviewId: 'b-1', pointsEarned: 10 });
    render(<BookingReviewClient />);
    fillAndSubmit();

    await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(1));
    expect(submitReview).toHaveBeenCalledWith({
      bookingId: 'b-1',
      rating: 4,
      comment: 'Sessione ottima, consigliato',
      tags: [],
    });
    await waitFor(() =>
      expect(updateBookingInList).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-1', hasReviewed: true }))
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['instructor-reviews', 'trainer-1'] });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows "already reviewed" and hides the form when the server says so', async () => {
    submitReview.mockRejectedValue({ code: 'functions/already-exists', message: 'Review already submitted' });
    render(<BookingReviewClient />);
    fillAndSubmit();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(updateBookingInList).toHaveBeenCalledWith(expect.objectContaining({ hasReviewed: true }));
  });

  it('keeps the form and shows the error on a generic failure', async () => {
    submitReview.mockRejectedValue(new Error('offline'));
    render(<BookingReviewClient />);
    fillAndSubmit();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(updateBookingInList).not.toHaveBeenCalled();
  });

  it('does not offer the form for a session that has not happened', () => {
    booking.status = 'accepted';
    render(<BookingReviewClient />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(submitReview).not.toHaveBeenCalled();
  });
});
