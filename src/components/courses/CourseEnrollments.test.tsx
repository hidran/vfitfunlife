import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stamp = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const mocks = vi.hoisted(() => ({ enrollments: [] as unknown[], waitlist: [] as unknown[] }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string, values?: Record<string, unknown>) => values ? `${k}:${JSON.stringify(values)}` : k, locale: 'en' }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useCourseEnrollments: () => ({ data: mocks.enrollments, isLoading: false, isError: false }),
  useMyWaitlist: () => ({ data: mocks.waitlist }),
  useCourseSessions: () => ({ data: [] }),
  useRefreshCourses: () => vi.fn(),
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: vi.fn() }));
vi.mock('./MyWaitlist', () => ({ MyWaitlist: () => <div data-testid="my-waitlist" /> }));

import { CourseEnrollments } from './CourseEnrollments';

const enrollment = (over: Record<string, unknown> = {}) => ({ id: 'e1', courseId: 'c1', courseName: 'Yoga', scope: 'lesson', state: 'confirmed',
  paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000, refundCents: 0, sessionIds: ['s1'], activeSessionIds: ['s1'],
  cancellationHours: 24, timezone: 'Europe/Rome', holdExpiresAt: stamp(0), ...over });

beforeEach(() => { mocks.enrollments = []; mocks.waitlist = []; });

describe('CourseEnrollments', () => {
  it('shows the pay-within hint next to Pay for a held enrollment promoted from the waitlist', () => {
    mocks.enrollments = [enrollment({ state: 'held', paymentMode: 'stripe', paymentStatus: 'pending', promotedFromWaitlist: true,
      holdExpiresAt: stamp(Date.now() + 29 * 60000) })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getByTestId('pay-within')).toHaveTextContent('"minutes":29');
    expect(screen.getByRole('button', { name: 'courses.pay' })).toBeInTheDocument();
  });

  it('shows no hint for an ordinary hold, and a normal confirmed card for a promoted direct enrollment', () => {
    mocks.enrollments = [
      enrollment({ id: 'e1', state: 'held', paymentMode: 'stripe', paymentStatus: 'pending', holdExpiresAt: stamp(Date.now() + 600000) }),
      enrollment({ id: 'e2', promotedFromWaitlist: true })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.queryByTestId('pay-within')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'courses.pay' })).toHaveLength(1);
    expect(screen.getByText('courses.confirmed')).toBeInTheDocument();
  });

  it('does not offer to pay once the hold has run out', () => {
    mocks.enrollments = [enrollment({ state: 'held', promotedFromWaitlist: true, holdExpiresAt: stamp(Date.now() - 1000) })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.queryByTestId('pay-within')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'courses.pay' })).not.toBeInTheDocument();
  });

  it('shows Free for a free booking and renders the waitlist section', () => {
    mocks.enrollments = [enrollment({ totalCents: 0 })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getByText(/courses.free/)).toBeInTheDocument();
    expect(screen.getByTestId('my-waitlist')).toBeInTheDocument();
  });

  it('says there are no bookings only when there are neither enrollments nor waitlist entries', () => {
    const { unmount } = render(<CourseEnrollments uid="me" />);
    expect(screen.getByText('courses.emptyBookings')).toBeInTheDocument();
    unmount();
    mocks.waitlist = [{ courseId: 'c1', sessionId: 's1' }];
    render(<CourseEnrollments uid="me" />);
    expect(screen.queryByText('courses.emptyBookings')).not.toBeInTheDocument();
  });
});
