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

import { getProviderAvailability, rescheduleBooking } from '@/lib/firebookings';
import { useBookingStore } from './bookingStore';
import type { Booking } from '@/types/booking';

const START = '2026-09-21T07:00:00.000Z';
const END = '2026-09-21T08:00:00.000Z';
const DAY = new Date(2026, 8, 21);

const booking = (id: string) =>
  ({ id, status: 'accepted', scheduledAt: { toDate: () => new Date(0) } }) as unknown as Booking;

beforeEach(() => {
  vi.clearAllMocks();
  useBookingStore.setState({ userBookings: [], currentBooking: null, availability: [], selectedTime: null });
});

describe('bookingStore.rescheduleBooking', () => {
  it('sends the slot instant it was handed, character for character', async () => {
    vi.mocked(rescheduleBooking).mockResolvedValue({ bookingId: 'b1', startsAt: START, scheduledEndAt: END });

    await useBookingStore.getState().rescheduleBooking('b1', START);

    expect(rescheduleBooking).toHaveBeenCalledWith('b1', START);
  });

  it('refuses to call the server with no instant at all', async () => {
    // The caller is supposed to read startsAt off a getProviderSlots slot. An empty one means
    // it found none, and letting the call through would ask the server to guess a time.
    await expect(useBookingStore.getState().rescheduleBooking('b1', '')).rejects.toThrow();
    expect(rescheduleBooking).not.toHaveBeenCalled();
  });

  it('moves the local copies to the instant the server confirmed', async () => {
    useBookingStore.setState({ userBookings: [booking('b1'), booking('b2')], currentBooking: booking('b1') });
    vi.mocked(rescheduleBooking).mockResolvedValue({ bookingId: 'b1', startsAt: START, scheduledEndAt: END });

    await useBookingStore.getState().rescheduleBooking('b1', START);

    const state = useBookingStore.getState();
    expect(state.userBookings[0].scheduledAt.toDate().toISOString()).toBe(START);
    expect(state.userBookings[0].scheduledEndAt?.toDate().toISOString()).toBe(END);
    expect(state.userBookings[1].scheduledAt.toDate().toISOString()).toBe(new Date(0).toISOString());
    expect(state.currentBooking?.scheduledAt.toDate().toISOString()).toBe(START);
  });
});

describe('bookingStore.fetchAvailability', () => {
  it('forwards the booking being moved so it stops blocking its own slot', async () => {
    vi.mocked(getProviderAvailability).mockResolvedValue([]);

    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY, 'b1');

    expect(getProviderAvailability).toHaveBeenCalledWith('p1', 's1', DAY, 'b1');
  });
});
