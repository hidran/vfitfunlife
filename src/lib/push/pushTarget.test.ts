import { describe, it, expect } from 'vitest';
import { pushTargetUrl } from './pushTarget';

describe('pushTargetUrl', () => {
  it('opens booking detail for booking_* pushes', () => {
    expect(pushTargetUrl({ type: 'booking_accepted', bookingId: 'b1' })).toBe(
      '/bookings/detail?id=b1'
    );
  });

  it('prefers an explicit same-origin link', () => {
    expect(pushTargetUrl({ link: '/provider/bookings/detail?id=b1', type: 'booking_requested', bookingId: 'b1' }))
      .toBe('/provider/bookings/detail?id=b1');
  });

  it('ignores off-site links', () => {
    expect(pushTargetUrl({ link: 'https://evil.test' })).toBe('/notifications');
    expect(pushTargetUrl({ link: '//evil.test/x' })).toBe('/notifications');
  });

  it('falls back to the inbox', () => {
    expect(pushTargetUrl(undefined)).toBe('/notifications');
    expect(pushTargetUrl({ type: 'vip' })).toBe('/notifications');
  });
});
