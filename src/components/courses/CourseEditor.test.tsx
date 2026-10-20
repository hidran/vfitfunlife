import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseEditor } from './CourseEditor';
import { I18nProvider } from '@/contexts/I18nContext';
import { itMessages } from '@/i18n/messages/it';
import type { Course } from '@/types/course';

const mocks = vi.hoisted(() => ({
  call: vi.fn(), save: vi.fn(), preview: vi.fn(),
  venues: [] as unknown[], locations: [] as unknown[], rooms: {} as Record<string, unknown[]>, links: [] as unknown[],
  sessions: [] as unknown[], role: 'provider',
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call, saveCourse: mocks.save, previewCourse: mocks.preview }));
vi.mock('@/hooks/useServiceCategories', () => ({ useServiceCategoryLeaves: () => [{ id: 'karate', name: 'Arti Marziali' }] }));
vi.mock('@/hooks/useManagedVenues', () => ({ useManagedVenues: () => ({ venues: mocks.venues, isLoading: false }) }));
vi.mock('@/hooks/useCourses', () => ({ useCourseSessions: () => ({ data: mocks.sessions }) }));
vi.mock('@/lib/firebase/venues', () => ({ fetchVenue: async () => null }));
vi.mock('@/lib/firebase/venueSpaces', () => ({
  fetchVenueLocations: async () => mocks.locations,
  fetchVenueRooms: async (_v: string, l: string) => mocks.rooms[l] ?? [],
  fetchVenueInstructorLinks: async () => mocks.links,
}));
vi.mock('@/lib/firebookings', () => ({ searchProviders: vi.fn(async () => []) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({
    user: { uid: 'me', fullName: 'Marta Me', role: mocks.role }, firebaseUser: { uid: 'me' } }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <I18nProvider>{children}</I18nProvider>
  </QueryClientProvider>
);
const label = (key: keyof typeof itMessages) => itMessages[key];
const gym = { id: 'v1', name: 'Smoke Gym', type: 'gym', ownerId: 'me', isActive: true };
const torino = { id: 'l1', name: 'Sede Torino', address: 'Via Roma 1', city: 'Torino', timezone: 'Asia/Tokyo', isActive: true };

beforeEach(() => {
  for (const fn of [mocks.call, mocks.save, mocks.preview]) fn.mockReset();
  mocks.save.mockResolvedValue({ courseId: 'c1' });
  mocks.venues = []; mocks.locations = []; mocks.rooms = {}; mocks.links = []; mocks.sessions = []; mocks.role = 'provider';
  sessionStorage.clear(); localStorage.setItem('vfit.locale', 'it');
});

async function pickCategory() {
  fireEvent.focus(screen.getByRole('combobox', { name: label('courses.category') }));
  fireEvent.click(within(await screen.findByRole('option', { name: 'Arti Marziali' })).getByRole('button'));
}

function venueFixture() {
  mocks.venues = [gym];
  mocks.locations = [torino];
  mocks.rooms = { l1: [{ id: 'r1', name: 'Sala A', isActive: true }, { id: 'r2', name: 'Sala B', isActive: true },
    { id: 'r3', name: 'Chiusa', isActive: false }] };
  mocks.links = [{ id: 'a', name: 'Anna Rossi', isActive: true }];
}

it('does not call preview with missing required inputs', () => {
  render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: label('courses.preview') }));
  expect(mocks.preview).not.toHaveBeenCalled();
});

describe('course editor', () => {
  it('preserves the unsaved draft across remounts', () => {
    const props = { onSaved: vi.fn(), onClose: vi.fn(), storageKey: 'course-draft-test' };
    const first = render(<CourseEditor {...props} />, { wrapper });
    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate beginners' } });
    first.unmount(); render(<CourseEditor {...props} />, { wrapper });
    expect(screen.getByLabelText(label('courses.name'))).toHaveValue('Karate beginners');
  });

  it('shows translated field guidance instead of JSON validation errors', async () => {
    mocks.preview.mockRejectedValue({ message: '[{"code":"too_small"}]', details: { fields: ['capacity'] } });
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    for (const [field, value] of [['name', 'Karate'], ['instructor', 'Anna'], ['location', 'Torino']])
      fireEvent.change(screen.getByLabelText(label(`courses.${field}` as keyof typeof itMessages)), { target: { value } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.preview') }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Controlla questi campi: Numero massimo di partecipanti.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('too_small');
  });

  it('keeps an unlinked course as it is: no venue select without managed venues, free-text place, no providerId', async () => {
    mocks.preview.mockResolvedValue({ sessions: [{ id: 's1', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z' }], conflicts: [] });
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    expect(screen.queryByLabelText(label('courses.venue'))).toBeNull();
    expect(screen.getByLabelText(label('courses.location'))).toBeInTheDocument();
    expect(screen.getByLabelText(label('courses.timezone'))).not.toHaveAttribute('readonly');
    for (const [field, value] of [['name', 'Karate'], ['instructor', 'Anna'], ['location', 'Torino']])
      fireEvent.change(screen.getByLabelText(label(`courses.${field}` as keyof typeof itMessages)), { target: { value } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const [draft, courseId, providerId] = mocks.save.mock.calls[0];
    expect(draft).toMatchObject({ venueId: null, locationId: null, roomId: null, instructorId: null, waitlistEnabled: true });
    expect(courseId).toBeUndefined();
    expect(providerId).toBeUndefined();
  });

  it('accepts a price of 0 and says it is free', async () => {
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    const price = screen.getByLabelText(label('courses.lessonPrice'), { exact: false });
    expect(price).toHaveAttribute('min', '0');
    fireEvent.change(price, { target: { value: '0' } });
    expect(price).toHaveValue(0);
    expect(screen.getByText(label('courses.free'))).toBeInTheDocument();
    for (const [field, value] of [['name', 'Karate'], ['instructor', 'Anna'], ['location', 'Torino']])
      fireEvent.change(screen.getByLabelText(label(`courses.${field}` as keyof typeof itMessages)), { target: { value } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].lessonPriceCents).toBe(0);
  });

  it('toggles the waitlist', async () => {
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    const box = screen.getByLabelText(label('courses.waitlist'));
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });
});

describe('venue cascade', () => {
  it('venue -> location (one is auto-selected) -> room; timezone follows the location read-only; place text is derived', async () => {
    venueFixture();
    render(<CourseEditor onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    fireEvent.change(await screen.findByLabelText(label('courses.venue')), { target: { value: 'v1' } });
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
    const room = await screen.findByLabelText(label('courses.room'));
    await screen.findByRole('option', { name: 'Sala A' });
    expect(screen.queryByRole('option', { name: 'Chiusa' })).toBeNull();
    fireEvent.change(room, { target: { value: 'r1' } });
    const zone = screen.getByLabelText(label('courses.timezone'));
    await waitFor(() => expect(zone).toHaveValue('Asia/Tokyo'));
    expect(zone).toHaveAttribute('readonly');
    expect(screen.getByText(label('courses.timezoneFromLocation'))).toBeInTheDocument();
    expect(screen.queryByLabelText(label('courses.location'))).toBeNull();
    expect(screen.queryByLabelText(label('courses.city'))).toBeNull();

    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate' } });
    fireEvent.change(screen.getByLabelText(label('courses.instructorSelect')), { target: { value: 'a' } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const [draft, , providerId] = mocks.save.mock.calls[0];
    expect(draft).toMatchObject({ venueId: 'v1', locationId: 'l1', roomId: 'r1', timezone: 'Asia/Tokyo',
      location: 'Sala A · Sede Torino', city: 'Torino', instructorId: 'a', instructor: 'Anna Rossi' });
    expect(providerId).toBeUndefined();
  });

  it('starts on the venue of ?venue= (initialVenueId)', async () => {
    venueFixture();
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    expect(await screen.findByLabelText(label('courses.venue'))).toHaveValue('v1');
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
  });

  it('points to the spaces panel when the venue has no locations', async () => {
    venueFixture(); mocks.locations = [];
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    const link = await screen.findByRole('link', { name: label('courses.addSpaces') });
    expect(link).toHaveAttribute('href', '/provider/courses?venue=v1#spaces');
  });

  it('staff creating for a venue they do not own sends the owner as providerId', async () => {
    venueFixture(); mocks.venues = [{ ...gym, ownerId: 'owner-1' }];
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
    fireEvent.change(await screen.findByLabelText(label('courses.room')), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate' } });
    fireEvent.change(screen.getByLabelText(label('courses.instructorSelect')), { target: { value: 'a' } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][2]).toBe('owner-1');
  });

  it('"other" instructor keeps a typed name with no instructor id', async () => {
    venueFixture();
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
    fireEvent.change(await screen.findByLabelText(label('courses.room')), { target: { value: 'r2' } });
    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate' } });
    await screen.findByRole('option', { name: 'Anna Rossi' });
    fireEvent.change(screen.getByLabelText(label('courses.instructorSelect')), { target: { value: '__other' } });
    fireEvent.change(await screen.findByLabelText(label('courses.instructor')), { target: { value: 'Guest Coach' } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ instructorId: null, instructor: 'Guest Coach', roomId: 'r2' });
  });

  it('shows an overlap from the preview under the conflicting lesson', async () => {
    venueFixture();
    mocks.preview.mockResolvedValue({
      sessions: [{ id: 's1', startsAt: '2030-01-07T17:00:00.000Z', endsAt: '2030-01-07T18:00:00.000Z' },
        { id: 's2', startsAt: '2030-01-14T17:00:00.000Z', endsAt: '2030-01-14T18:00:00.000Z' }],
      conflicts: [{ sessionId: 's2', kind: 'room', courseName: 'Yoga Mattina', startsAt: '2030-01-14T17:30:00.000Z', endsAt: '2030-01-14T18:30:00.000Z' }],
    });
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
    fireEvent.change(await screen.findByLabelText(label('courses.room')), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate' } });
    await screen.findByRole('option', { name: 'Anna Rossi' });
    fireEvent.change(screen.getByLabelText(label('courses.instructorSelect')), { target: { value: 'a' } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.preview') }));
    const rows = await screen.findAllByRole('listitem');
    await waitFor(() => expect(screen.getAllByText(/Yoga Mattina/).length).toBe(1));
    const conflicted = rows.filter(row => within(row).queryByText(/Yoga Mattina/));
    expect(conflicted).toHaveLength(1);
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ venueId: 'v1', roomId: 'r1' }), undefined);
  });

  it('maps a save error to its translated message', async () => {
    venueFixture();
    mocks.save.mockRejectedValue({ message: 'room_overlap', details: { courseName: 'Yoga Mattina', startsAt: '2030-01-14T17:30:00.000Z', fields: ['startDate'] } });
    render(<CourseEditor initialVenueId="v1" onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText(label('courses.locationSelect'))).toHaveValue('l1'));
    fireEvent.change(await screen.findByLabelText(label('courses.room')), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText(label('courses.name')), { target: { value: 'Karate' } });
    await screen.findByRole('option', { name: 'Anna Rossi' });
    fireEvent.change(screen.getByLabelText(label('courses.instructorSelect')), { target: { value: 'a' } });
    await pickCategory();
    fireEvent.click(screen.getByRole('button', { name: label('courses.save') }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Yoga Mattina'));
  });

  it('freezes venue, location, room and instructor once the course has bookings', async () => {
    venueFixture();
    mocks.sessions = [{ id: 's1', occupied: 1, held: 0 }];
    const course = { id: 'c1', name: 'Karate', providerId: 'me', venueId: 'v1', locationId: 'l1', roomId: 'r1', instructorId: 'a',
      instructor: 'Anna Rossi', location: 'Sala A · Sede Torino', city: 'Torino', timezone: 'Asia/Tokyo', categoryId: 'karate',
      description: '', capacity: 5, durationMinutes: 60, startDate: '2030-01-07', startTime: '18:00', recurrence: 'none', interval: 1,
      weekdays: [], endDate: '2030-01-07', lessonPriceCents: 1000, seriesPriceCents: null, bookingNoticeHours: 2, cancellationHours: 24,
      level: '', equipment: '', state: 'published', enrollmentClosed: false, waitlistEnabled: true } as unknown as Course;
    render(<CourseEditor course={course} onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await screen.findByRole('option', { name: 'Sala A' });
    for (const name of ['courses.venue', 'courses.locationSelect', 'courses.room', 'courses.instructorSelect'] as const)
      expect(screen.getByLabelText(label(name))).toBeDisabled();
    expect(screen.getByLabelText(label('courses.name'))).not.toBeDisabled();
  });

  it('leaves the venue editable while the course has no bookings', async () => {
    venueFixture();
    mocks.sessions = [{ id: 's1', occupied: 0, held: 0 }];
    const course = { id: 'c1', name: 'Karate', providerId: 'me', venueId: 'v1', locationId: 'l1', roomId: 'r1', instructorId: 'a',
      instructor: 'Anna Rossi', location: 'x', city: 'Torino', timezone: 'Asia/Tokyo', categoryId: 'karate', description: '', capacity: 5,
      durationMinutes: 60, startDate: '2030-01-07', startTime: '18:00', recurrence: 'none', interval: 1, weekdays: [], endDate: '2030-01-07',
      lessonPriceCents: 1000, seriesPriceCents: null, bookingNoticeHours: 2, cancellationHours: 24, level: '', equipment: '',
      state: 'draft', enrollmentClosed: false, waitlistEnabled: true } as unknown as Course;
    render(<CourseEditor course={course} onSaved={vi.fn()} onClose={vi.fn()} />, { wrapper });
    await screen.findByRole('option', { name: 'Sala A' });
    expect(screen.getByLabelText(label('courses.room'))).not.toBeDisabled();
  });
});
