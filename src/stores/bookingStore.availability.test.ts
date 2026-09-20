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

import { getProviderAvailability } from '@/lib/firebookings';
import { useBookingStore } from './bookingStore';

const slot = (time: string) => ({ time, startsAt: `2026-09-21T${time}:00+02:00`, isAvailable: true, isBooked: false });
const DAY = new Date(2026, 8, 21);

beforeEach(() => {
  vi.clearAllMocks();
  useBookingStore.setState({ availability: [], selectedTime: null, availabilityError: null });
});

describe('bookingStore.fetchAvailability', () => {
  it('asks for the selected service and stores the offered slots', async () => {
    vi.mocked(getProviderAvailability).mockResolvedValue([slot('09:00'), slot('10:00')]);
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);

    expect(getProviderAvailability).toHaveBeenCalledWith('p1', 's1', DAY);
    expect(useBookingStore.getState().availability.map((s) => s.time)).toEqual(['09:00', '10:00']);
  });

  it('forgets a chosen time that is no longer offered', async () => {
    useBookingStore.setState({ selectedTime: '09:00' });
    vi.mocked(getProviderAvailability).mockResolvedValue([slot('10:00')]);
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().selectedTime).toBeNull();
  });

  it('ignores an answer that arrives after a newer request', async () => {
    let releaseFirst: (v: ReturnType<typeof slot>[]) => void = () => {};
    vi.mocked(getProviderAvailability)
      .mockImplementationOnce(() => new Promise((r) => { releaseFirst = r; }))
      .mockResolvedValueOnce([slot('15:00')]);

    const first = useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    await useBookingStore.getState().fetchAvailability('p1', 's1', new Date(2026, 8, 22));
    releaseFirst([slot('09:00')]);
    await first;

    expect(useBookingStore.getState().availability.map((s) => s.time)).toEqual(['15:00']);
  });

  it('says "sign in" rather than "no times" to a signed-out visitor', async () => {
    vi.mocked(getProviderAvailability).mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/unauthenticated' }));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('signin');

    vi.mocked(getProviderAvailability).mockRejectedValue(new Error('offline'));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('failed');
  });

  it('distinguishes a permanent permission refusal and a not-found from a generic failure', async () => {
    vi.mocked(getProviderAvailability).mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/permission-denied' }));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('permission');

    vi.mocked(getProviderAvailability).mockRejectedValue(Object.assign(new Error('service_not_found'), { code: 'functions/not-found' }));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('notFound');

    vi.mocked(getProviderAvailability).mockRejectedValue(Object.assign(new Error('instructor_not_found'), { code: 'functions/not-found' }));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().availabilityError).toBe('notFound');
  });

  it('drops a chosen time when the refetch itself fails, not just when the slot list comes back without it', async () => {
    useBookingStore.setState({ selectedTime: '09:00' });
    vi.mocked(getProviderAvailability).mockRejectedValue(new Error('offline'));
    await useBookingStore.getState().fetchAvailability('p1', 's1', DAY);
    expect(useBookingStore.getState().selectedTime).toBeNull();
  });
});
