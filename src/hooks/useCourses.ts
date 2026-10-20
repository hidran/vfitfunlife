import { useMemo } from 'react';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCourses, fetchCourseSessions, fetchCourseEnrollments, fetchCourseParticipants, fetchCourseRefunds, quoteCourse,
  fetchVenueCourses, fetchVenueEnrollments, fetchVenueRefunds, fetchWaitlist, fetchMyWaitlist, fetchVenueWeek,
  fetchVenueNextLessons, fetchCustomerCounters, fetchCourse, fetchCourseRoster,
} from '@/lib/firebase/courses';
/**
 * Reads cost money. Public and customer screens do not poll: their data is fresh for a minute, refetched when the tab
 * is focused again and after every action (`useRefreshCourses`). Manager screens poll once a minute, and not while the
 * tab is in the background.
 */
const PUBLIC_READ = { staleTime: 60000, refetchOnWindowFocus: true } as const;
const MANAGER_POLL = { refetchInterval: 60000, refetchIntervalInBackground: false, refetchOnWindowFocus: true } as const;

/** `providerId` undefined lists the public catalogue; `enabled: false` switches the query off (venue-scoped screens). */
export function useCourses(providerId?: string, enabled = true) {
  return useInfiniteQuery({ queryKey: ['courses', providerId ?? 'public'], enabled,
    queryFn: ({ pageParam }) => fetchCourses(providerId, pageParam),
    initialPageParam: undefined as Awaited<ReturnType<typeof fetchCourses>>['cursor'],
    ...(providerId ? MANAGER_POLL : PUBLIC_READ), getNextPageParam: page => page.cursor });
}
export const useCourseSessions = (id?: string) => useQuery({ queryKey: ['courses', 'sessions', id],
  queryFn: () => fetchCourseSessions(id!), enabled: !!id, ...PUBLIC_READ });
export const useCourseEnrollments = (uid?: string, provider = false) => useQuery({
  queryKey: ['courses', 'enrollments', uid, provider], queryFn: () => fetchCourseEnrollments(uid!, provider),
  enabled: !!uid, ...(provider ? MANAGER_POLL : PUBLIC_READ) });
/** Bookings of the selected course (a roster shows one course at a time). */
export const useCourseRoster = (courseId?: string, scope?: { venueId: string } | { providerId: string }) => useQuery({
  queryKey: ['courses', 'roster', courseId, scope], queryFn: () => fetchCourseRoster(courseId!, scope!),
  enabled: !!courseId && !!scope, ...MANAGER_POLL });
export const useCourseParticipants = (courseId?: string, sessionId?: string) => useQuery({
  queryKey: ['courses', 'participants', courseId, sessionId],
  queryFn: () => fetchCourseParticipants(courseId!, sessionId!), enabled: !!courseId && !!sessionId });
export const useCourseRefunds = (uid?: string) => useQuery({ queryKey: ['courses', 'refunds', uid],
  queryFn: () => fetchCourseRefunds(uid!), enabled: !!uid });
/** A rate-limited quote is not retried: every retry spends another of the 60 calls per 10 minutes. */
const retryQuote = (count: number, err: unknown) => count < 2 &&
  !/rate_limited|resource-exhausted/.test(`${(err as { message?: string })?.message ?? ''} ${(err as { code?: string })?.code ?? ''}`);
/** Server quote for the given lessons; the key carries the ids so a different selection never reuses a stale price. */
export const useCourseQuote = (courseId?: string, sessionIds?: string[], includeSeries = true, enabled = true) => useQuery({
  queryKey: ['courses', 'quote', courseId, sessionIds ?? null, includeSeries],
  queryFn: () => quoteCourse(courseId!, sessionIds, includeSeries), enabled: !!courseId && enabled, staleTime: 15000, retry: retryQuote });
/** Not `useVenueCourses` (src/hooks/useVenues.ts is the legacy gym classes list, removed with the gym flow). */
export const useManagedVenueCourses = (venueId?: string) => useQuery({ queryKey: ['courses', 'venue', venueId],
  queryFn: () => fetchVenueCourses(venueId!), enabled: !!venueId, ...MANAGER_POLL });
/**
 * Course documents by id, one `getDoc` each (shared with the `/courses?id=` page through the `detail` key and kept for
 * ten minutes). A course the caller may not read, or that is gone, is simply absent from `map`.
 */
export function useCoursesById(ids: string[], enabled = true) {
  const results = useQueries({ queries: ids.map(id => ({ queryKey: ['courses', 'detail', id], queryFn: () => fetchCourse(id),
    enabled, staleTime: 10 * 60000, refetchOnWindowFocus: false, retry: false })) });
  const stamp = results.map(r => `${r.dataUpdatedAt}:${r.status}`).join('|');
  return useMemo(() => ({
    map: new Map(results.flatMap(r => r.data ? [[r.data.id, r.data] as const] : [])),
    isLoading: enabled && results.some(r => r.isLoading),
    // One unreadable course must not blank the timetable: it only fails when no course could be read at all.
    isError: enabled && results.length > 0 && results.every(r => r.isError),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stamp, enabled]);
}
export const useVenueEnrollments = (venueId?: string) => useQuery({ queryKey: ['courses', 'venueEnrollments', venueId],
  queryFn: () => fetchVenueEnrollments(venueId!), enabled: !!venueId, ...MANAGER_POLL });
export const useVenueRefunds = (venueId?: string) => useQuery({ queryKey: ['courses', 'venueRefunds', venueId],
  queryFn: () => fetchVenueRefunds(venueId!), enabled: !!venueId });
export const useWaitlist = (courseId?: string, sessionId?: string) => useQuery({
  queryKey: ['courses', 'waitlist', courseId, sessionId], queryFn: () => fetchWaitlist(courseId!, sessionId!),
  enabled: !!courseId && !!sessionId });
export const useMyWaitlist = (uid?: string) => useQuery({ queryKey: ['courses', 'myWaitlist', uid],
  queryFn: () => fetchMyWaitlist(uid!), enabled: !!uid, ...PUBLIC_READ });
export const useVenueWeek = (venueId?: string, weekStart?: string) => useQuery({
  queryKey: ['courses', 'venueWeek', venueId, weekStart], queryFn: () => fetchVenueWeek(venueId!, weekStart!),
  enabled: !!venueId && !!weekStart, ...PUBLIC_READ });
export const useVenueNextLessons = (venueId?: string, count = 3) => useQuery({
  queryKey: ['courses', 'venueNext', venueId, count], queryFn: () => fetchVenueNextLessons(venueId!, count),
  enabled: !!venueId, ...PUBLIC_READ });
export const useCustomerCounters = (courseId?: string, enabled = true) => useQuery({
  queryKey: ['courses', 'customers', courseId], queryFn: () => fetchCustomerCounters(courseId!), enabled: !!courseId && enabled });
export function useRefreshCourses() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['courses'] });
}
