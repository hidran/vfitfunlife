import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: '' as string, push: vi.fn(), replace: vi.fn(), call: vi.fn(), refresh: vi.fn(),
  role: 'provider', providerStatus: 'verified', venues: [] as { id: string; name: string }[], venuesLoading: false,
  providerCourses: [] as unknown[], venueCourses: [] as unknown[], enrollments: [] as unknown[], refunds: [] as unknown[],
  seen: { courses: [] as unknown[][], venueCourses: [] as unknown[][], enrollments: [] as unknown[][], venueEnrollments: [] as unknown[][] },
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
  useCourseRefunds: (uid?: string) => ({ data: uid ? mocks.refunds : undefined }),
  useVenueRefunds: (venueId?: string) => ({ data: venueId ? mocks.refunds : undefined }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
vi.mock('@/components/venues/VenueSpacesPanel', () => ({ VenueSpacesPanel: ({ venueId }: { venueId: string }) => <div data-testid="spaces">{venueId}</div> }));

import { ProviderCourses } from './ProviderCourses';

const course = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Karate', state: 'published', location: 'Room A · Gym', sessionIds: ['s1'], capacity: 8, timezone: 'Europe/Rome',
  venueId: 'v1', locationId: 'l1', roomId: 'r1', ...over });
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProviderCourses /></QueryClientProvider>);

beforeEach(() => {
  for (const fn of [mocks.push, mocks.replace, mocks.call, mocks.refresh]) fn.mockReset();
  mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockResolvedValue(undefined);
  Object.assign(mocks, { search: '', role: 'provider', providerStatus: 'verified', venues: [], venuesLoading: false,
    providerCourses: [course({ venueId: null, locationId: null, roomId: null })], venueCourses: [course()], enrollments: [], refunds: [] });
  for (const list of Object.values(mocks.seen)) list.length = 0;
});

describe('scope', () => {
  it('uses the provider queries without ?venue and links create and participants plainly', async () => {
    mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    expect(await screen.findByText('Karate')).toBeInTheDocument();
    expect(mocks.seen.courses.at(-1)).toEqual(['me', true]);
    expect(mocks.seen.venueCourses.at(-1)).toEqual([undefined]);
    // No refund is due: the booking list is not read.
    expect(mocks.seen.enrollments.at(-1)).toEqual([undefined, true]);
    expect(screen.getByRole('link', { name: 'courses.create' })).toHaveAttribute('href', '/provider/courses/create');
    expect(screen.getByRole('link', { name: 'courses.roster' })).toHaveAttribute('href', '/provider/courses/detail?id=c1');
    expect(screen.queryByTestId('spaces')).toBeNull();
  });

  it('uses the venue queries with ?venue, names the venue, carries ?venue on links and mounts the spaces panel', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    expect(await screen.findByText('Karate')).toBeInTheDocument();
    expect(mocks.seen.venueCourses.at(-1)).toEqual(['v1']);
    expect(mocks.seen.venueEnrollments.at(-1)).toEqual([undefined]);
    expect(mocks.seen.courses.at(-1)).toEqual([undefined, false]);
    expect(mocks.seen.enrollments.at(-1)).toEqual([undefined, true]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smoke Gym');
    expect(screen.getByRole('link', { name: 'courses.create' })).toHaveAttribute('href', '/provider/courses/create?venue=v1');
    expect(screen.getByRole('link', { name: 'courses.edit' })).toHaveAttribute('href', '/provider/courses/edit?id=c1&venue=v1');
    expect(screen.getByRole('link', { name: 'courses.roster' })).toHaveAttribute('href', '/provider/courses/detail?id=c1&venue=v1');
    expect(screen.getByTestId('spaces')).toHaveTextContent('v1');
  });

  it('reads the whole booking list only while a refund is due', async () => {
    mocks.search = 'venue=v1'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    await screen.findByText('Karate');
    expect(mocks.seen.venueEnrollments.every(args => args[0] === undefined)).toBe(true);
    for (const list of Object.values(mocks.seen)) list.length = 0;
    mocks.refunds = [{ id: 'r1', status: 'pending', amountCents: 500, enrollmentId: 'e1', paymentMode: 'direct' }];
    renderPage();
    await waitFor(() => expect(mocks.seen.venueEnrollments.at(-1)).toEqual(['v1']));
  });

  it('shows a clear message, and reads nothing, for a ?venue= the user does not manage', async () => {
    mocks.search = 'venue=ghost'; mocks.venues = [{ id: 'v1', name: 'Smoke Gym' }];
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.venueUnavailable');
    expect(screen.queryByText('Karate')).toBeNull();
    expect(screen.queryByTestId('spaces')).toBeNull();
    expect(screen.queryByRole('link', { name: 'courses.create' })).toBeNull();
    expect(mocks.seen.venueCourses.every(args => args[0] === undefined)).toBe(true);
    expect(mocks.seen.courses.every(args => args[0] === undefined && args[1] === false)).toBe(true);
  });

  it('waits for the venue lookup before judging a ?venue=, and lets an admin open any venue', async () => {
    mocks.search = 'venue=v1'; mocks.venues = []; mocks.venuesLoading = true; mocks.role = 'customer'; mocks.providerStatus = 'none';
    const first = renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.seen.venueCourses.every(args => args[0] === undefined)).toBe(true);
    first.unmount();
    mocks.venuesLoading = false; mocks.role = 'admin';
    renderPage();
    expect(await screen.findByText('Karate')).toBeInTheDocument();
    expect(mocks.seen.venueCourses.at(-1)).toEqual(['v1']);
  });

  it('encodes the venue in the links it builds', async () => {
    mocks.search = 'venue=a%26b'; mocks.venues = [{ id: 'a&b', name: 'Odd' }];
    renderPage();
    expect(await screen.findByRole('link', { name: 'courses.create' })).toHaveAttribute('href', '/provider/courses/create?venue=a%26b');
    expect(screen.getByRole('link', { name: 'courses.edit' })).toHaveAttribute('href', '/provider/courses/edit?id=c1&venue=a%26b');
    expect(screen.getByRole('link', { name: 'courses.roster' })).toHaveAttribute('href', '/provider/courses/detail?id=c1&venue=a%26b');
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

describe('refunds', () => {
  it('names the customer of a refund that is still due and confirms it', async () => {
    mocks.refunds = [{ id: 'r1', status: 'pending', amountCents: 500, enrollmentId: 'e1', paymentMode: 'direct' }];
    mocks.enrollments = [{ id: 'e1', customerName: 'Ada' }];
    renderPage();
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmRefund' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('confirmCourseRefund', { refundId: 'r1' }));
  });
});
