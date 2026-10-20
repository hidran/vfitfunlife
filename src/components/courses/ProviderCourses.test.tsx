import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const FUTURE = Date.now() + 5 * 86400000;
const PAST = Date.now() - 86400000;

const mocks = vi.hoisted(() => ({
  search: '' as string, push: vi.fn(), replace: vi.fn(), call: vi.fn(), refresh: vi.fn(),
  role: 'provider', providerStatus: 'verified', venues: [] as { id: string; name: string }[], venuesLoading: false,
  providerCourses: [] as unknown[], venueCourses: [] as unknown[], enrollments: [] as unknown[], sessions: [] as unknown[],
  participants: [] as unknown[], counters: [] as unknown[], rooms: [] as unknown[], waitlist: [] as unknown[],
  refunds: [] as unknown[],
  seen: { courses: [] as unknown[][], venueCourses: [] as unknown[][], enrollments: [] as unknown[][], venueEnrollments: [] as unknown[][], roster: [] as unknown[][] },
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
    firebaseUser: { uid: 'me' }, user: { uid: 'me', role: mocks.role, providerStatus: mocks.providerStatus, fullName: 'Me' } }),
}));
vi.mock('@/hooks/useManagedVenues', () => ({ useManagedVenues: () => ({ venues: mocks.venues, isLoading: mocks.venuesLoading }) }));
vi.mock('@/hooks/useCourses', () => ({
  useCourses: (...args: unknown[]) => {
    mocks.seen.courses.push(args);
    return { data: { pages: [{ courses: mocks.providerCourses }] }, isLoading: false, isError: false, hasNextPage: false, fetchNextPage: vi.fn() };
  },
  useManagedVenueCourses: (...args: unknown[]) => {
    mocks.seen.venueCourses.push(args);
    return { data: args[0] ? mocks.venueCourses : undefined, isLoading: false, isError: false };
  },
  useCourseEnrollments: (...args: unknown[]) => { mocks.seen.enrollments.push(args); return { data: args[0] ? mocks.enrollments : undefined }; },
  useVenueEnrollments: (...args: unknown[]) => { mocks.seen.venueEnrollments.push(args); return { data: args[0] ? mocks.enrollments : undefined }; },
  useCourseRoster: (...args: unknown[]) => { mocks.seen.roster.push(args); return { data: args[0] ? mocks.enrollments : undefined }; },
  useCourseRefunds: (uid?: string) => ({ data: uid ? mocks.refunds : undefined }),
  useVenueRefunds: (venueId?: string) => ({ data: venueId ? mocks.refunds : undefined }),
  useCourseSessions: (id?: string) => ({ data: id ? mocks.sessions : undefined }),
  useCourseParticipants: (c?: string, s?: string) => ({ data: c && s ? mocks.participants : undefined, isError: false }),
  useCustomerCounters: () => ({ data: mocks.counters }),
  useWaitlist: () => ({ data: mocks.waitlist }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
vi.mock('@/lib/firebase/venueSpaces', () => ({ fetchVenueRooms: async () => mocks.rooms }));
vi.mock('@/components/venues/VenueSpacesPanel', () => ({ VenueSpacesPanel: ({ venueId }: { venueId: string }) => <div data-testid="spaces">{venueId}</div> }));
vi.mock('@/components/courses/AddCourseParticipant', () => ({ AddCourseParticipant: () => <div /> }));
vi.mock('@/components/courses/ParticipantInvitation', () => ({
  ParticipantInvitation: ({ courseId, userId }: { courseId: string; userId: string }) => <div data-testid="invite">{courseId}:{userId}</div>,
}));

import { ProviderCourses } from './ProviderCourses';

const course = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Karate', state: 'published', location: 'Room A · Gym', sessionIds: ['s1'], capacity: 8, timezone: 'Europe/Rome',
  venueId: 'v1', locationId: 'l1', roomId: 'r1', ...over });
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProviderCourses /></QueryClientProvider>);

async function openLesson() {
  fireEvent.click(await screen.findByRole('button', { name: 'courses.roster' }));
  fireEvent.change(screen.getByLabelText('courses.lesson'), { target: { value: 's1' } });
}

beforeEach(() => {
  for (const fn of [mocks.push, mocks.replace, mocks.call, mocks.refresh]) fn.mockReset();
  mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockResolvedValue(undefined);
  Object.assign(mocks, { search: '', role: 'provider', providerStatus: 'verified', venues: [], venuesLoading: false,
    providerCourses: [course({ venueId: null, locationId: null, roomId: null })], venueCourses: [course()], enrollments: [],
    sessions: [{ id: 's1', startsAt: ts(FUTURE), endsAt: ts(FUTURE + 3600000), capacity: 8, occupied: 1, held: 0, state: 'scheduled', roomId: 'r1' }],
    participants: [], counters: [], rooms: [], waitlist: [], refunds: [] });
  for (const list of Object.values(mocks.seen)) list.length = 0;
});

describe('scope', () => {
  it('uses the provider queries without ?venue and links create plainly', async () => {
    mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    expect(await screen.findByText('Karate')).toBeInTheDocument();
    expect(mocks.seen.courses.at(-1)).toEqual(['me', true]);
    expect(mocks.seen.venueCourses.at(-1)).toEqual([undefined]);
    // No refund is due and no course is open: neither booking list is read.
    expect(mocks.seen.enrollments.at(-1)).toEqual([undefined, true]);
    expect(mocks.seen.roster.at(-1)).toEqual([undefined, { providerId: 'me' }]);
    expect(screen.getByRole('link', { name: 'courses.create' })).toHaveAttribute('href', '/provider/courses/create');
    expect(screen.queryByTestId('spaces')).toBeNull();
  });

  it('uses the venue queries with ?venue, names the venue, carries ?venue on links and mounts the spaces panel', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    expect(await screen.findByText('Karate')).toBeInTheDocument();
    expect(mocks.seen.venueCourses.at(-1)).toEqual(['v1']);
    expect(mocks.seen.venueEnrollments.at(-1)).toEqual([undefined]);
    expect(mocks.seen.roster.at(-1)).toEqual([undefined, { venueId: 'v1' }]);
    expect(mocks.seen.courses.at(-1)).toEqual([undefined, false]);
    expect(mocks.seen.enrollments.at(-1)).toEqual([undefined, true]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smoke Gym');
    expect(screen.getByRole('link', { name: 'courses.create' })).toHaveAttribute('href', '/provider/courses/create?venue=v1');
    expect(screen.getByRole('link', { name: 'courses.edit' })).toHaveAttribute('href', '/provider/courses/edit?id=c1&venue=v1');
    expect(screen.getByTestId('spaces')).toHaveTextContent('v1');
  });

  it('reads the bookings of the selected course only, and the whole list only while a refund is due', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    await openLesson();
    expect(mocks.seen.roster.at(-1)).toEqual(['c1', { venueId: 'v1' }]);
    expect(mocks.seen.venueEnrollments.every(args => args[0] === undefined)).toBe(true);
    for (const list of Object.values(mocks.seen)) list.length = 0;
    mocks.refunds = [{ id: 'r1', status: 'pending', amountCents: 500, enrollmentId: 'e1', paymentMode: 'direct' }];
    cleanup();
    renderPage();
    await screen.findByText('Karate');
    expect(mocks.seen.venueEnrollments.at(-1)).toEqual(['v1']);
  });

  it('offers a switcher when the user manages several venues', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }, { id: 'v2', name: 'Other Studio' }];
    renderPage();
    fireEvent.change(await screen.findByLabelText('courses.venue'), { target: { value: 'v2' } });
    expect(mocks.push).toHaveBeenCalledWith('/provider/courses?venue=v2');
  });

  it('sends a venue manager who is not a provider to their first venue', async () => {
    mocks.role = 'customer'; mocks.providerStatus = 'none'; mocks.venues = [{ id: 'v9', name: 'Biz' }];
    renderPage();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/provider/courses?venue=v9'));
  });

  it('does not redirect a provider, nor while the venue lookup runs', async () => {
    mocks.venues = [{ id: 'v9', name: 'Biz' }];
    const first = renderPage();
    await screen.findByText('Karate');
    expect(mocks.replace).not.toHaveBeenCalled();
    first.unmount();
    mocks.role = 'customer'; mocks.providerStatus = 'none'; mocks.venuesLoading = true;
    renderPage();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('roster', () => {
  beforeEach(() => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
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
});

describe('reschedule', () => {
  it('sends the chosen room and the previewed instant', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
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
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession', expect.objectContaining({
      courseId: 'c1', sessionId: 's1', action: 'reschedule', roomId: 'r2', reason: 'Teacher ill', startsAt: '2030-01-01T10:00:00.000Z' })));
  });

  it('maps a server error through the error catalog', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    mocks.rooms = [{ id: 'r1', name: 'Room A', isActive: true }];
    mocks.call.mockImplementation(async (name: string) => {
      if (name === 'previewCourse') return { sessions: [{ startsAt: '2030-01-01T10:00:00.000Z' }], conflicts: [] };
      throw Object.assign(new Error('room_overlap'), { details: { courseName: 'Yoga', startsAt: '2030-01-01T10:00:00.000Z' } });
    });
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.reschedule' }));
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/courses.startDate/), { target: { value: '2030-01-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.room_overlap');
  });

  it('an unlinked course shows no room select', async () => {
    mocks.providerCourses = [course({ venueId: null, locationId: null, roomId: null })];
    renderPage(); await openLesson();
    fireEvent.click(screen.getByRole('button', { name: 'courses.reschedule' }));
    expect(screen.queryByLabelText('courses.rescheduleRoom')).toBeNull();
  });
});

describe('lesson actions', () => {
  const person = { id: 'u1', userId: 'u1', customerName: 'Ada', enrollmentId: 'e1', state: 'confirmed', attendance: 'unmarked' };
  beforeEach(() => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
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
    mocks.sessions = [{ id: 's1', startsAt: ts(PAST), endsAt: ts(PAST + 3600000), capacity: 8, occupied: 1, held: 0, state: 'scheduled' }];
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
