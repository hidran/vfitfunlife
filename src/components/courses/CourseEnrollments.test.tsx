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
    expect(screen.getByRole('button', { name: 'courses.confirmCancelBooking' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'courses.confirm' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByText('courses.cancelBookingConfirm')).not.toBeInTheDocument();
  });

  it('says why Cancel booking is missing for an upcoming lesson inside the cancellation window, and not for a free-to-cancel or past one', () => {
    mocks.sessions = [
      { id: 's1', startsAt: stamp(Date.now() + 2 * 3600000), state: 'scheduled' },
      { id: 's2', startsAt: stamp(Date.now() + 5 * 86400000), state: 'scheduled' },
      { id: 's3', startsAt: stamp(Date.now() - 3600000), state: 'scheduled' }];
    mocks.enrollments = [enrollment({ sessionIds: ['s1', 's2', 's3'], activeSessionIds: ['s1', 's2', 's3'] })];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getAllByRole('button', { name: 'courses.cancelBooking' })).toHaveLength(1);
    const reasons = screen.getAllByTestId('cancel-closed');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toHaveTextContent('courses.cancelClosed:{"hours":24}');
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

describe('long series', () => {
  const lesson = (id: string, iso: string) => ({ id, startsAt: stamp(Date.parse(iso)), state: 'scheduled' });
  const series = (lessons: { id: string }[]) => enrollment({
    sessionIds: lessons.map(l => l.id), activeSessionIds: lessons.map(l => l.id) });

  it('opens on the next lesson\'s month and filters the series by month', () => {
    const lessons = [lesson('f1', '2099-02-03T18:00Z'), lesson('f2', '2099-02-10T18:00Z'),
      lesson('m1', '2099-03-03T18:00Z'), lesson('m2', '2099-03-10T18:00Z')];
    mocks.sessions = lessons; mocks.enrollments = [series(lessons)];
    render(<CourseEnrollments uid="me" />);
    const month = screen.getByLabelText('courses.month') as HTMLSelectElement;
    expect(month.value).toBe('2099-02');
    expect(screen.getByText(/Feb 3, 2099/)).toBeInTheDocument();
    expect(screen.queryByText(/Mar 3, 2099/)).toBeNull();
    const march = [...month.options].find(option => /March 2099/.test(option.textContent ?? ''))!;
    fireEvent.change(month, { target: { value: march.value } });
    expect(screen.getByText(/Mar 3, 2099/)).toBeInTheDocument();
    expect(screen.queryByText(/Feb 3, 2099/)).toBeNull();
    fireEvent.change(month, { target: { value: '' } });
    expect(screen.getAllByRole('button', { name: 'courses.cancelBooking' })).toHaveLength(4);
  });

  it('pages through the lessons of a month instead of one endless card', () => {
    const lessons = Array.from({ length: 12 }, (_, index) =>
      lesson(`d${index}`, `2099-02-${String(index + 1).padStart(2, '0')}T18:00Z`));
    mocks.sessions = lessons; mocks.enrollments = [series(lessons)];
    render(<CourseEnrollments uid="me" />);
    expect(screen.getAllByRole('button', { name: 'courses.cancelBooking' })).toHaveLength(10);
    expect(screen.getByTestId('lessons-shown')).toHaveTextContent('courses.lessonsShown:{"from":1,"to":10,"total":12}');
    fireEvent.click(screen.getByRole('button', { name: 'courses.nextPage' }));
    expect(screen.getAllByRole('button', { name: 'courses.cancelBooking' })).toHaveLength(2);
    expect(screen.getByTestId('lessons-shown')).toHaveTextContent('courses.lessonsShown:{"from":11,"to":12,"total":12}');
  });
});
