import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stamp = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });
const mocks = vi.hoisted(() => ({ enrollments: [] as unknown[], sessions: [] as unknown[], courses: [] as unknown[], coursesAsked: [] as string[][] }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string, values?: Record<string, unknown>) => values ? `${k}:${JSON.stringify(values)}` : k, locale: 'en' }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useCourseEnrollments: () => ({ data: mocks.enrollments, isLoading: false, isError: false }),
  useCourseSessions: () => ({ data: mocks.sessions }),
  useCoursesById: (ids: string[]) => { mocks.coursesAsked.push(ids); return { map: new Map((mocks.courses as { id: string }[]).filter(c => ids.includes(c.id)).map(c => [c.id, c])) }; },
  useRefreshCourses: () => vi.fn(),
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: vi.fn() }));
vi.mock('./MyWaitlist', () => ({ MyWaitlist: ({ showEmpty }: { showEmpty?: boolean }) => <div data-testid="my-waitlist" data-empty={String(!!showEmpty)} /> }));

import { CourseEnrollments } from './CourseEnrollments';

const enrollment = (over: Record<string, unknown> = {}) => ({ id: 'e1', courseId: 'c1', courseName: 'Yoga', scope: 'lesson', state: 'confirmed',
  paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000, refundCents: 0, sessionIds: ['s1'], activeSessionIds: ['s1'],
  cancellationHours: 24, timezone: 'Europe/Rome', holdExpiresAt: stamp(0), ...over });

beforeEach(() => { mocks.enrollments = []; mocks.sessions = []; mocks.courses = []; mocks.coursesAsked = []; });

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

  it('asks the waitlist section to say "no bookings" only when there are no enrollments', () => {
    const { unmount } = render(<CourseEnrollments uid="me" />);
    expect(screen.getByTestId('my-waitlist')).toHaveAttribute('data-empty', 'true');
    unmount();
    mocks.enrollments = [enrollment()];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getByTestId('my-waitlist')).toHaveAttribute('data-empty', 'false');
  });

  it('uses the singular for the last minute of a promoted hold', () => {
    mocks.enrollments = [enrollment({ state: 'held', paymentMode: 'stripe', paymentStatus: 'pending', promotedFromWaitlist: true,
      holdExpiresAt: stamp(Date.now() + 20000) })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getByTestId('pay-within')).toHaveTextContent(/^courses.payWithinOne$/);
  });

  it('confirms a cancellation with its own question and a Cancel button', () => {
    mocks.sessions = [{ id: 's1', startsAt: stamp(Date.now() + 5 * 86400000), state: 'scheduled' }];
    mocks.enrollments = [enrollment()];
    render(<CourseEnrollments uid="me" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.cancelBooking' }));
    expect(screen.getByText('courses.cancelBookingConfirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByText('courses.cancelBookingConfirm')).not.toBeInTheDocument();
  });

  it('takes the time zone of an older booking from its course, and shows no time rather than a guessed one', () => {
    mocks.sessions = [{ id: 's1', startsAt: stamp(Date.parse('2099-10-12T17:00:00Z')), state: 'scheduled' }];
    mocks.enrollments = [enrollment({ timezone: undefined })];
    mocks.courses = [{ id: 'c1', timezone: 'Asia/Tokyo' }];
    const { unmount } = render(<CourseEnrollments uid="me" />);
    expect(mocks.coursesAsked.at(-1)).toEqual(['c1']);
    expect(screen.getByText(/Oct 13, 2099/)).toBeInTheDocument();
    unmount();
    mocks.courses = [];
    render(<CourseEnrollments uid="me" />);
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
  });

  it('does not look up a course when the booking carries its time zone', () => {
    mocks.enrollments = [enrollment()];
    render(<CourseEnrollments uid="me" />);
    expect(mocks.coursesAsked.at(-1)).toEqual([]);
  });
});
