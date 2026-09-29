import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingConfirmPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'client-1', pointsBalance: 0, walletBalance: 0 } }),
}));

const createBooking = vi.fn();
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    selectedProvider: { id: 'trainer-1', fullName: 'Coach Marco', avatarUrl: null, location: null },
    selectedService: { id: 'svc-1', name: 'Personal Training', price: 50, durationMinutes: 60 },
    selectedDate: new Date('2026-10-05T00:00:00'),
    selectedTime: '10:00',
    availability: [{ time: '10:00', startsAt: '2026-10-05T08:00:00.000Z', isAvailable: true }],
    appliedPromo: null,
    isApplyingPromo: false,
    createBooking,
    applyPromoCode: vi.fn(),
    clearPromoCode: vi.fn(),
  }),
}));

function acceptTermsAndConfirm() {
  // The terms checkbox is the button right before the terms paragraph; confirm is the last.
  const buttons = screen.getAllByRole('button');
  const terms = buttons.find((b) => b.nextElementSibling?.tagName === 'P' && b.className.includes('rounded border-2'));
  fireEvent.click(terms!);
  fireEvent.click(buttons.at(-1)!);
}

describe('booking confirm — note for the trainer (B2)', () => {
  beforeEach(() => {
    createBooking.mockReset();
    createBooking.mockResolvedValue({ id: 'b-1' });
  });

  it('sends the trimmed note with the booking', async () => {
    render(<BookingConfirmPage />);
    const note = screen.getByRole('textbox', { name: /trainer/i });
    expect(note).toHaveAttribute('maxLength', '500');
    fireEvent.change(note, { target: { value: '  Mal di schiena, esercizi leggeri  ' } });
    expect(screen.getByText(/36\/500/)).toBeInTheDocument();

    acceptTermsAndConfirm();
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(createBooking.mock.calls[0][0]).toMatchObject({ userNotes: 'Mal di schiena, esercizi leggeri' });
  });

  it('sends no note when the field is left blank', async () => {
    render(<BookingConfirmPage />);
    fireEvent.change(screen.getByRole('textbox', { name: /trainer/i }), { target: { value: '   ' } });
    acceptTermsAndConfirm();
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(createBooking.mock.calls[0][0].userNotes).toBeUndefined();
  });
});
