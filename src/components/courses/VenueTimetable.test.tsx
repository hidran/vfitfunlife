import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime(), toDate: () => new Date(iso) });

const mocks = vi.hoisted(() => ({
  search: 'id=v1', uid: undefined as string | undefined, role: 'customer',
  venue: { id: 'v1', name: 'Smoke Gym', partnerStatus: 'active', isActive: true } as Record<string, unknown> | undefined,
  sessions: [] as unknown[], courses: [] as unknown[], managed: [] as { id: string }[],
  quote: vi.fn(), wide: false, courseReads: [] as string[][],
  /** Per-week sessions for the paging tests; falls back to `sessions`. */
  sessionsOf: undefined as undefined | ((week: string) => unknown[]),
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, locale: 'en' }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({
    firebaseUser: mocks.uid ? { uid: mocks.uid } : null, user: { role: mocks.role } }),
}));
vi.mock('@/hooks/useVenues', () => ({ useVenue: () => ({ data: mocks.venue, isLoading: false }) }));
vi.mock('@/hooks/useManagedVenues', () => ({ useManagedVenues: () => ({ venues: mocks.managed, isLoading: false }) }));
vi.mock('@/hooks/useCourses', () => ({
  useVenueWeek: (venueId?: string, week?: string) => ({ data: venueId ? (mocks.sessionsOf ? mocks.sessionsOf(week!) : mocks.sessions) : undefined,
    isLoading: false, isError: false }),
  useCoursesById: (ids: string[], enabled = true) => { mocks.courseReads.push(ids);
    return { map: new Map(enabled ? (mocks.courses as { id: string }[]).filter(c => ids.includes(c.id)).map(c => [c.id, c]) : []), isLoading: false, isError: false }; },
}));
vi.mock('@/lib/firebase/courses', () => ({ quoteCourse: (...args: unknown[]) => mocks.quote(...args) }));
vi.mock('@/lib/firebase/venueSpaces', () => ({
  fetchVenueLocations: async () => [{ id: 'l1', name: 'Via Roma', timezone: 'Europe/Rome', isActive: true }],
  fetchVenueRooms: async () => [{ id: 'r1', name: 'Sala Uno', isActive: true }, { id: 'r2', name: 'Sala Due', isActive: true }],
}));

import { VenueTimetable } from './VenueTimetable';

const course = (over: Record<string, unknown> = {}) => ({ id: 'c1', name: 'Yoga', timezone: 'Europe/Rome', capacity: 2,
  lessonPriceCents: 1000, seriesPriceCents: null, bookingNoticeHours: 2, state: 'published', enrollmentClosed: false,
  waitlistEnabled: true, location: 'Sala Uno · Via Roma', ...over });
const lesson = (id: string, iso: string, over: Record<string, unknown> = {}) => ({ id, courseId: 'c1', state: 'scheduled',
  startsAt: ts(iso), endsAt: ts(new Date(new Date(iso).getTime() + 3600000).toISOString()), capacity: 2, occupied: 0, held: 0,
  listed: true, roomId: 'r1', locationId: 'l1', instructorId: 'i1', instructorName: 'Anna', ...over });

function renderTimetable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><VenueTimetable /></QueryClientProvider>);
}
const grid = () => screen.getByTestId('week-grid');
const cellLinks = (day: string) => Array.from(grid().querySelectorAll(`[data-day="${day}"] a`));
const cellCards = (day: string) => Array.from(grid().querySelectorAll(`[data-day="${day}"] [data-testid="timetable-card"]`));

beforeEach(() => {
  // Wednesday 2026-10-14 in Rome. Only Date is faked: timers must keep running for the query client.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T09:00:00Z') });
  mocks.search = 'id=v1'; mocks.uid = undefined; mocks.role = 'customer'; mocks.managed = [];
  mocks.venue = { id: 'v1', name: 'Smoke Gym', partnerStatus: 'active', isActive: true };
  mocks.courses = [course()]; mocks.sessions = []; mocks.sessionsOf = undefined; mocks.wide = false; mocks.courseReads = [];
  mocks.quote.mockReset();
  window.matchMedia = ((query: string) => ({ matches: mocks.wide, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.useRealTimers());

describe('VenueTimetable', () => {
  it('puts a Monday and a Sunday lesson in their columns', async () => {
    mocks.sessions = [lesson('mon', '2026-10-12T17:00:00Z'), lesson('sun', '2026-10-18T08:00:00Z')];
    renderTimetable();
    await waitFor(() => expect(cellCards('2026-10-12')).toHaveLength(1));
    expect(cellCards('2026-10-18')).toHaveLength(1);
    expect(cellCards('2026-10-18')[0].getAttribute('href')).toBe('/courses/detail?id=c1&lesson=sun');
    expect(cellCards('2026-10-14')).toHaveLength(0);
  });

  it('shows a lesson that already started as information only: no link, no opacity', async () => {
    mocks.sessions = [lesson('mon', '2026-10-12T17:00:00Z')];
    renderTimetable();
    await waitFor(() => expect(cellCards('2026-10-12')).toHaveLength(1));
    const [card] = cellCards('2026-10-12');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveAttribute('data-past', 'true');
    expect(card.className).not.toMatch(/opacity/);
    expect(card.querySelector('a')).toBeNull();
  });

  it('labels the grid rows with the viewer\'s own time format', async () => {
    mocks.sessions = [lesson('thu', '2026-10-15T17:00:00Z')];
    renderTimetable();
    await waitFor(() => expect(grid().querySelectorAll('a')).toHaveLength(1));
    // en: 7:00 PM in Rome, the same text as the card, not the 24 h grouping key.
    expect(within(grid()).getAllByText(/7:00\s?PM/).length).toBeGreaterThanOrEqual(2);
    expect(within(grid()).queryByText('19:00')).not.toBeInTheDocument();
  });

  it('keeps all seven day tabs reachable at 320 px: a scrolling strip of tabs at least 44 px wide', async () => {
    renderTimetable();
    const strip = await screen.findByTestId('day-tabs');
    expect(strip.className).toMatch(/overflow-x-auto/);
    const tab = screen.getByTestId('tab-2026-10-14');
    expect(tab.className).toMatch(/min-w-12/);
    expect(tab.className).toMatch(/shrink-0/);
    expect(strip.querySelectorAll('button')).toHaveLength(7);
  });

  it('keeps the DST-change week right: a late Sunday lesson stays Sunday, 00:30 Monday leaves the week', async () => {
    vi.setSystemTime(new Date('2026-10-21T09:00:00Z'));
    mocks.sessions = [lesson('late', '2026-10-25T22:30:00Z'), lesson('early', '2026-10-25T23:30:00Z')];
    renderTimetable();
    await waitFor(() => expect(cellLinks('2026-10-25')).toHaveLength(1));
    expect(cellLinks('2026-10-25')[0].getAttribute('href')).toContain('lesson=late');
    expect(grid().querySelectorAll('a')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('timetable.next'));
    await waitFor(() => expect(cellLinks('2026-10-26')).toHaveLength(1));
    expect(cellLinks('2026-10-26')[0].getAttribute('href')).toContain('lesson=early');
  });

  it('shows one day at a time behind day tabs on a phone', async () => {
    mocks.sessions = [lesson('mon', '2026-10-12T17:00:00Z'), lesson('tue', '2026-10-13T17:00:00Z', { courseId: 'c2' })];
    mocks.courses = [course(), course({ id: 'c2', name: 'Pilates' })];
    renderTimetable();
    const list = screen.getByTestId('day-list');
    // Today (Wednesday) has nothing.
    await waitFor(() => expect(within(list).getByText('timetable.empty')).toBeInTheDocument());
    expect(screen.getByTestId('tab-2026-10-14')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('tab-2026-10-13'));
    expect(screen.getByTestId('tab-2026-10-13')).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByText('Pilates')).toBeInTheDocument();
    expect(within(list).queryByText('Yoga')).not.toBeInTheDocument();
  });

  it('filters by room and instructor', async () => {
    mocks.sessions = [lesson('a', '2026-10-12T17:00:00Z', { roomId: 'r1' }),
      lesson('b', '2026-10-13T17:00:00Z', { roomId: 'r2', instructorId: 'i2', instructorName: 'Bruno' })];
    renderTimetable();
    const cards = () => grid().querySelectorAll('[data-testid="timetable-card"]');
    await waitFor(() => expect(cards()).toHaveLength(2));
    fireEvent.change(await screen.findByRole('option', { name: 'Sala Due' }).then(o => o.closest('select')!), { target: { value: 'r2' } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('courses.instructor'), { target: { value: 'i1' } });
    expect(cards()).toHaveLength(0);
    expect(screen.getByTestId('timetable-empty')).toBeInTheDocument();
  });

  it('says Full, or that the waitlist is open, for a full lesson', async () => {
    mocks.sessions = [lesson('a', '2026-10-15T17:00:00Z', { occupied: 2 })];
    mocks.courses = [course({ waitlistEnabled: true })];
    const { unmount } = renderTimetable();
    await waitFor(() => expect(within(grid()).getByText('timetable.waitlistOpen')).toBeInTheDocument());
    unmount();
    mocks.courses = [course({ waitlistEnabled: false })];
    renderTimetable();
    await waitFor(() => expect(within(grid()).getByText('timetable.full')).toBeInTheDocument());
  });

  it('shows the regular price struck through and the discounted price to a signed-in user', async () => {
    mocks.uid = 'u1'; mocks.wide = true;
    mocks.sessions = [lesson('a', '2026-10-15T17:00:00Z')];
    mocks.quote.mockResolvedValue({ series: null, sessions: [{ sessionId: 'a', revision: 1, regularCents: 1000, discountPercent: 20,
      discountCents: 200, finalCents: 800, gymPercent: 20, instructorPercent: 0, availableSeats: 2, waitlisted: 0, stripeEligible: true }] });
    renderTimetable();
    await waitFor(() => expect(within(grid()).getByTestId('final-price')).toHaveTextContent('€8.00'));
    expect(within(grid()).getByTestId('regular-price')).toHaveTextContent('€10.00');
    expect(mocks.quote).toHaveBeenCalledWith('c1', ['a'], false);
    // A struck-through price is read as "regular price … final price …", not as two bare numbers.
    expect(within(grid()).getByText('courses.regularPrice')).toHaveClass('sr-only');
    expect(within(grid()).getByText('courses.finalPrice')).toHaveClass('sr-only');
  });

  it('keeps two courses with the same lesson date apart (lesson ids are dates)', async () => {
    mocks.uid = 'u1'; mocks.wide = true;
    mocks.courses = [course(), course({ id: 'c2', name: 'Pilates', lessonPriceCents: 0 })];
    mocks.sessions = [lesson('2026-10-15', '2026-10-15T17:00:00Z'), lesson('2026-10-15', '2026-10-15T17:00:00Z', { courseId: 'c2' })];
    const q = (sessionId: string, finalCents: number) => ({ series: null, sessions: [{ sessionId, revision: 1, regularCents: finalCents,
      discountPercent: 0, discountCents: 0, finalCents, gymPercent: 0, instructorPercent: 0, availableSeats: 2, waitlisted: 0, stripeEligible: true }] });
    mocks.quote.mockImplementation(async (courseId: string) => courseId === 'c1' ? q('2026-10-15', 1000) : q('2026-10-15', 0));
    renderTimetable();
    await waitFor(() => {
      const cards = within(grid()).getAllByTestId('timetable-card');
      expect(cards.map(c => within(c).getByTestId('final-price').textContent)).toEqual(['€10.00', 'courses.free']);
    });
  });

  describe('quote budget (60 calls / 10 min per user)', () => {
    const courses20 = Array.from({ length: 20 }, (_, i) => course({ id: `c${i}`, name: `Course ${i}` }));
    /** Every course has a lesson on the Wednesday of the requested week. */
    const wednesdays = (week: string) => courses20.map((c, i) => {
      const day = new Date(new Date(`${week}T00:00:00Z`).getTime() + 2 * 86400000).toISOString().slice(0, 10);
      return lesson(day, `${day}T${String(8 + (i % 10)).padStart(2, '0')}:00:00Z`, { courseId: c.id as string });
    });
    const answer = async (courseId: string, ids: string[]) => ({ series: null, sessions: ids.map(sessionId => ({ sessionId, revision: 1,
      regularCents: 1000, discountPercent: 0, discountCents: 0, finalCents: 1000, gymPercent: 0, instructorPercent: 0, availableSeats: 2,
      waitlisted: 0, stripeEligible: true, courseId })) });

    it('on a phone quotes only the courses of the selected day, once each', async () => {
      mocks.uid = 'u1'; mocks.courses = courses20;
      mocks.sessions = [lesson('2026-10-14', '2026-10-14T17:00:00Z', { courseId: 'c3' }), lesson('2026-10-15', '2026-10-15T17:00:00Z', { courseId: 'c4' })];
      mocks.quote.mockImplementation(answer);
      renderTimetable();
      await waitFor(() => expect(mocks.quote).toHaveBeenCalledTimes(1));
      expect(mocks.quote).toHaveBeenCalledWith('c3', ['2026-10-14'], false);
      fireEvent.click(screen.getByTestId('tab-2026-10-15'));
      await waitFor(() => expect(mocks.quote).toHaveBeenCalledTimes(2));
      expect(mocks.quote).toHaveBeenLastCalledWith('c4', ['2026-10-15'], false);
      // Back to a day already quoted: served from the cache.
      fireEvent.click(screen.getByTestId('tab-2026-10-14'));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(mocks.quote).toHaveBeenCalledTimes(2);
    });

    it('caps a crowded day and a crowded desktop week at 8 courses, and skips past lessons', async () => {
      mocks.uid = 'u1'; mocks.courses = courses20; mocks.wide = true;
      mocks.sessionsOf = wednesdays;
      mocks.quote.mockImplementation(answer);
      renderTimetable();
      await waitFor(() => expect(mocks.quote).toHaveBeenCalledTimes(8));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(mocks.quote).toHaveBeenCalledTimes(8);
    });

    it('does not quote lessons that already started', async () => {
      mocks.uid = 'u1';
      mocks.sessions = [lesson('2026-10-14', '2026-10-14T07:00:00Z')];
      renderTimetable();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(mocks.quote).not.toHaveBeenCalled();
    });

    it('five quick week changes on a 20-course venue issue a bounded number of calls', async () => {
      mocks.uid = 'u1'; mocks.courses = courses20;
      mocks.sessionsOf = wednesdays;
      mocks.quote.mockImplementation(answer);
      renderTimetable();
      await waitFor(() => expect(mocks.quote).toHaveBeenCalled());
      await new Promise(resolve => setTimeout(resolve, 500));
      const before = mocks.quote.mock.calls.length;
      expect(before).toBeLessThanOrEqual(8);
      for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('timetable.next'));
      await new Promise(resolve => setTimeout(resolve, 800));
      // Only the week you stop on is quoted, with the same day's courses.
      expect(mocks.quote.mock.calls.length - before).toBeLessThanOrEqual(8);
      expect(mocks.quote.mock.calls.length).toBeLessThanOrEqual(16);
    });
  });

  it('shows only the regular price to a visitor and never quotes', async () => {
    mocks.sessions = [lesson('a', '2026-10-15T17:00:00Z')];
    renderTimetable();
    await waitFor(() => expect(within(grid()).getByTestId('final-price')).toHaveTextContent('€10.00'));
    expect(within(grid()).queryByTestId('regular-price')).not.toBeInTheDocument();
    expect(mocks.quote).not.toHaveBeenCalled();
  });

  it('reads only the courses of the lessons it shows, never the catalogue', async () => {
    mocks.courses = [course(), course({ id: 'c2', name: 'Pilates' }), course({ id: 'c3', name: 'Judo' })];
    mocks.sessions = [lesson('a', '2026-10-15T17:00:00Z'), lesson('b', '2026-10-16T17:00:00Z', { courseId: 'c2' }), lesson('c', '2026-10-16T18:00:00Z', { courseId: 'c2' })];
    renderTimetable();
    await waitFor(() => expect(grid().querySelectorAll('a')).toHaveLength(3));
    expect(mocks.courseReads.at(-1)).toEqual(['c1', 'c2']);
  });

  it('says so when the week is empty', async () => {
    renderTimetable();
    expect(await screen.findByTestId('timetable-empty')).toBeInTheDocument();
  });

  it('shows a message instead of the grid for a suspended venue', () => {
    mocks.venue = { id: 'v1', name: 'Smoke Gym', partnerStatus: 'suspended', isActive: true };
    renderTimetable();
    expect(screen.getByText('timetable.suspended')).toBeInTheDocument();
    expect(screen.queryByTestId('week-grid')).not.toBeInTheDocument();
  });

  it('links managers to the venue course management', () => {
    mocks.managed = [{ id: 'v1' }];
    renderTimetable();
    expect(screen.getByRole('link', { name: 'timetable.manage' })).toHaveAttribute('href', '/provider/courses?venue=v1');
  });
});
