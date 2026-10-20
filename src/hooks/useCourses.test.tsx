import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/courses', () => {
  const read = () => vi.fn(async () => []);
  return { fetchCourses: vi.fn(async () => ({ courses: [] })), fetchCourseSessions: read(), fetchCourseEnrollments: read(), fetchCourseParticipants: read(),
    fetchCourseRefunds: read(), quoteCourse: read(), fetchVenueCourses: read(), fetchVenueEnrollments: read(), fetchVenueRefunds: read(),
    fetchWaitlist: read(), fetchMyWaitlist: read(), fetchVenueWeek: read(), fetchVenueNextLessons: read(), fetchCustomerCounters: read(),
    fetchCourse: vi.fn(async () => null) };
});

import {
  useCourses, useCourseSessions, useCourseEnrollments, useManagedVenueCourses, useVenueEnrollments, useMyWaitlist,
  useVenueWeek, useVenueNextLessons,
} from './useCourses';

function observerOptions(run: () => unknown, client = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  renderHook(run, { wrapper });
  return client.getQueryCache().getAll()[0].observers[0].options as { refetchInterval?: number; refetchIntervalInBackground?: boolean; refetchOnWindowFocus?: boolean; staleTime?: number };
}

describe('course read cost', () => {
  it.each<[string, () => unknown]>([
    ['public catalogue', () => useCourses()],
    ['booking sheet lessons', () => useCourseSessions('c1')],
    ['customer bookings', () => useCourseEnrollments('u1')],
    ['customer waitlist', () => useMyWaitlist('u1')],
    ['venue week', () => useVenueWeek('v1', '2026-10-12')],
    ['venue next lessons', () => useVenueNextLessons('v1', 3)],
  ])('%s does not poll and refetches on focus', (_name, run) => {
    const options = observerOptions(run);
    expect(options.refetchInterval).toBeUndefined();
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.staleTime).toBeGreaterThanOrEqual(60000);
  });

  it.each<[string, () => unknown]>([
    ['venue enrollments', () => useVenueEnrollments('v1')],
    ['venue courses', () => useManagedVenueCourses('v1')],
    ['provider enrollments', () => useCourseEnrollments('p1', true)],
    ['provider courses', () => useCourses('p1')],
  ])('%s polls once a minute and not in a background tab', (_name, run) => {
    const options = observerOptions(run);
    expect(options.refetchInterval).toBe(60000);
    expect(options.refetchIntervalInBackground).toBe(false);
  });
});
