import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const FUTURE = Date.now() + 5 * 86400000;
const PAST = Date.now() - 86400000;

const mocks = vi.hoisted(() => ({
  search: '' as string, push: vi.fn(), replace: vi.fn(), call: vi.fn(), refresh: vi.fn(), fetch: vi.fn(),
  sessions: [] as unknown[], participants: [] as unknown[], enrollments: [] as unknown[], counters: [] as unknown[],
  rooms: [] as unknown[], waitlist: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, locale: 'en' }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({
    firebaseUser: { uid: 'me' }, user: { uid: 'me', role: 'provider', providerStatus: 'verified' } }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useCourseRoster: (...args: unknown[]) => ({ data: args[0] ? mocks.enrollments : undefined }),
  useCourseSessions: (id?: string) => ({ data: id ? mocks.sessions : undefined, isError: false }),
  useCourseParticipants: (c?: string, s?: string) => ({ data: c && s ? mocks.participants : undefined, isError: false }),
  useCustomerCounters: () => ({ data: mocks.counters }),
  useWaitlist: () => ({ data: mocks.waitlist }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call, fetchCourse: mocks.fetch }));
vi.mock('@/lib/firebase/venueSpaces', () => ({ fetchVenueRooms: async () => mocks.rooms }));
vi.mock('@/components/courses/AddCourseParticipant', () => ({ AddCourseParticipant: () => <div data-testid="add-participant" /> }));
vi.mock('@/components/courses/ParticipantInvitation', () => ({
  ParticipantInvitation: ({ courseId, userId }: { courseId: string; userId: string }) => <div data-testid="invite">{courseId}:{userId}</div>,
}));

import { CourseRoster } from './CourseRoster';

const course = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Karate', state: 'published', location: 'Room A · Gym', sessionIds: ['s1'], capacity: 8, timezone: 'Europe/Rome',
  venueId: 'v1', locationId: 'l1', roomId: 'r1', instructorId: 'other', ...over });
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CourseRoster /></QueryClientProvider>);
const lesson = (over: Record<string, unknown> = {}) => ({ id: 's1', startsAt: ts(FUTURE), endsAt: ts(FUTURE + 3600000), capacity: 8,
  occupied: 1, held: 0, state: 'scheduled', roomId: 'r1', ...over });

/** Opens the lesson of the address: the deep link preselects it, so the roster renders without a click. */
async function openLesson() {
  await screen.findByRole('heading', { level: 1, name: 'Karate' });
}

beforeEach(() => {
  for (const fn of [mocks.push, mocks.replace, mocks.call, mocks.refresh, mocks.fetch]) fn.mockReset();
  mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(course());
  Object.assign(mocks, { search: 'id=c1&venue=v1&lesson=s1', sessions: [lesson()], participants: [], enrollments: [],
    counters: [], rooms: [], waitlist: [] });
});

describe('addressing', () => {
  it('reads the course of ?id= and the lesson of ?lesson=', async () => {
    renderPage();
    await openLesson();
    expect(mocks.fetch).toHaveBeenCalledWith('c1');
    expect(screen.getByLabelText('courses.lesson')).toHaveValue('s1');
    expect(screen.getByRole('link', { name: 'courses.back' })).toHaveAttribute('href', '/provider/courses?venue=v1');
    expect(screen.getByRole('link', { name: 'courses.edit' })).toHaveAttribute('href', '/provider/courses/edit?id=c1&venue=v1');
  });

  it('keeps the chosen lesson in the address, so the page can be reloaded or shared', async () => {
    mocks.sessions = [lesson(), lesson({ id: 's2' })];
    renderPage();
    await openLesson();
    fireEvent.change(screen.getByLabelText('courses.lesson'), { target: { value: 's2' } });
    expect(mocks.replace).toHaveBeenCalledWith('/provider/courses/detail?id=c1&venue=v1&lesson=s2');
  });

  it('says so, and reads nothing, without a course id', () => {
    mocks.search = '';
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('courses.loadError');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('shows a readable error when the course cannot be read', async () => {
    mocks.fetch.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.loadError');
    expect(screen.getByRole('link', { name: 'courses.back' })).toHaveAttribute('href', '/provider/courses?venue=v1');
  });
});

describe('roster', () => {
  beforeEach(() => {
    mocks.participants = [
      { id: 'u1', userId: 'u1', customerName: 'Ada', enrollmentId: 'e1', state: 'confirmed', attendance: 'absent', noShow: true },
      { id: 'u2', userId: 'u2', customerName: 'Bob', enrollmentId: 'e2', state: 'confirmed', attendance: 'unmarked' },
      { id: 'u3', userId: 'u3', customerName: 'Cy', enrollmentId: 'e3', state: 'confirmed', attendance: 'absent', noShow: true },
    ];
    mocks.enrollments = [
      { id: 'e1', courseId: 'c1', customerName: 'Ada', paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000 },
      { id: 'e2', courseId: 'c1', customerName: 'Bob', paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000 },
      { id: 'e3', courseId: 'c1', customerName: 'Cy', paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000 },
      { id: 'e4', courseId: 'c1', userId: 'u4', customerName: 'Dee', state: 'cancelled', lateCancelledSessionIds: ['s1'], totalCents: 1000 },
      { id: 'e5', courseId: 'c1', userId: 'u5', customerName: 'Eve', state: 'cancelled', lateCancelledSessionIds: ['other'], totalCents: 1000 },
    ];
    mocks.counters = [{ id: 'u1', userId: 'u1', noShows: 1 }, { id: 'u3', userId: 'u3', noShows: 3 }, { id: 'u4', userId: 'u4', lateCancels: 2 }];
  });

  it('shows no-show badges and repeat counts from two no-shows on', async () => {
    renderPage(); await openLesson();
    expect(screen.getAllByText('courses.noShow')).toHaveLength(2);
    expect(screen.getByText('courses.noShows:{"count":3}')).toBeInTheDocument();
    expect(screen.queryByText('courses.noShows:{"count":1}')).toBeNull();
  });

  it('lists customers who cancelled late for this lesson only, with their repeat count', async () => {
    renderPage(); await openLesson();
    expect(screen.getByText('courses.lateCancels')).toBeInTheDocument();
    expect(screen.getByText(/Dee/)).toBeInTheDocument();
    expect(screen.queryByText(/Eve/)).toBeNull();
    expect(screen.getByText(/Dee.*2/)).toBeInTheDocument();
  });

  it('passes the course id to invitations', async () => {
    renderPage(); await openLesson();
    expect(screen.getAllByTestId('invite')[0]).toHaveTextContent('c1:u1');
  });

  it('offers the add-participant form on an upcoming lesson only', async () => {
    renderPage(); await openLesson();
    expect(screen.getByTestId('add-participant')).toBeInTheDocument();
  });
});

describe('confirm buttons', () => {
  it('cancel lesson confirms with its own label, never "Confirm booking"', async () => {
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.cancelLesson' }));
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'Teacher ill' } });
    expect(screen.queryByRole('button', { name: 'courses.confirm' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmCancelLesson' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession', expect.objectContaining({ action: 'cancel', reason: 'Teacher ill' })));
  });

  it('record payment is an inline form on the page, not a dialog, and still sends the method', async () => {
    mocks.participants = [{ id: 'u2', userId: 'u2', customerName: 'Bob', enrollmentId: 'e2', state: 'confirmed', attendance: 'unmarked' }];
    mocks.enrollments = [{ id: 'e2', courseId: 'c1', customerName: 'Bob', paymentMode: 'direct', paymentStatus: 'pending', totalCents: 1000, cancellationHours: 1 }];
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.recordPayment' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('courses.paymentMethod')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('recordCoursePayment', { enrollmentId: 'e2', method: 'cash' }));
  });
});

describe('reschedule', () => {
  it('sends the chosen room and the previewed instant', async () => {
    mocks.rooms = [{ id: 'r1', name: 'Room A', isActive: true }, { id: 'r2', name: 'Room B', isActive: true }, { id: 'r3', name: 'Old', isActive: false }];
    mocks.call.mockImplementation(async (name: string) => name === 'previewCourse' ?
      { sessions: [{ startsAt: '2030-01-01T10:00:00.000Z' }], conflicts: [] } : { success: true });
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.reschedule' }));
    await screen.findByRole('option', { name: 'Room B' });
    expect(screen.queryByRole('option', { name: 'Old' })).toBeNull();
    fireEvent.change(screen.getByLabelText('courses.rescheduleRoom'), { target: { value: 'r2' } });
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'Teacher ill' } });
    fireEvent.change(screen.getByLabelText(/courses.startDate/), { target: { value: '2030-01-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmReschedule' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession', expect.objectContaining({
      courseId: 'c1', sessionId: 's1', action: 'reschedule', roomId: 'r2', reason: 'Teacher ill', startsAt: '2030-01-01T10:00:00.000Z' })));
  });

  it('maps a server error through the error catalog', async () => {
    mocks.rooms = [{ id: 'r1', name: 'Room A', isActive: true }];
    mocks.call.mockImplementation(async (name: string) => {
      if (name === 'previewCourse') return { sessions: [{ startsAt: '2030-01-01T10:00:00.000Z' }], conflicts: [] };
      throw Object.assign(new Error('room_overlap'), { details: { courseName: 'Yoga', startsAt: '2030-01-01T10:00:00.000Z' } });
    });
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.reschedule' }));
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/courses.startDate/), { target: { value: '2030-01-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmReschedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.room_overlap');
  });

  it('an unlinked course shows no room select', async () => {
    mocks.fetch.mockResolvedValue(course({ venueId: null, locationId: null, roomId: null }));
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.reschedule' }));
    expect(screen.queryByLabelText('courses.rescheduleRoom')).toBeNull();
  });
});

describe('lesson actions', () => {
  const person = { id: 'u1', userId: 'u1', customerName: 'Ada', enrollmentId: 'e1', state: 'confirmed', attendance: 'unmarked' };
  beforeEach(() => {
    mocks.participants = [person];
    mocks.enrollments = [{ id: 'e1', courseId: 'c1', customerName: 'Ada', paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000, cancellationHours: 24 }];
  });

  it('offers substitute, capacity and removal on an upcoming lesson only', async () => {
    renderPage(); await openLesson();
    expect(screen.getByRole('button', { name: 'courses.substitute' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'courses.capacityAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'courses.removeParticipant Ada' })).toBeInTheDocument();
  });

  it('hides them once the lesson has started', async () => {
    mocks.sessions = [lesson({ startsAt: ts(PAST), endsAt: ts(PAST + 3600000) })];
    renderPage(); await openLesson();
    expect(screen.queryByRole('button', { name: 'courses.substitute' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'courses.capacityAction' })).toBeNull();
    expect(screen.queryByRole('button', { name: /courses.removeParticipant/ })).toBeNull();
  });

  it('removes a participant after a confirmation, without a late warning before the deadline', async () => {
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.removeParticipant Ada' }));
    expect(screen.queryByText('courses.removeLateWarning')).toBeNull();
    expect(mocks.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmRemove' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession',
      { courseId: 'c1', sessionId: 's1', action: 'removeParticipant', userId: 'u1' }));
  });

  it('warns about a late cancellation past the customer deadline and still sends the reason', async () => {
    mocks.enrollments = [{ id: 'e1', courseId: 'c1', customerName: 'Ada', paymentMode: 'direct', paymentStatus: 'paid', totalCents: 1000, cancellationHours: 24 * 30 }];
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.removeParticipant Ada' }));
    expect(screen.getByText('courses.removeLateWarning')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'No show last time' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmRemove' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession',
      expect.objectContaining({ action: 'removeParticipant', userId: 'u1', reason: 'No show last time' })));
  });

  it('shows the waitlist of the lesson', async () => {
    mocks.waitlist = [{ id: 'w1', userId: 'w1', customerName: 'Wendy', position: 1 }];
    renderPage(); await openLesson();
    expect(screen.getByText('courses.waitlistTitle')).toBeInTheDocument();
    expect(screen.getByText('Wendy')).toBeInTheDocument();
  });
});
