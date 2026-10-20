import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCourses, fetchCourseSessions, fetchCourseEnrollments, fetchCourseParticipants, fetchCourseRefunds, quoteCourse,
  fetchVenueCourses, fetchVenueEnrollments, fetchVenueRefunds, fetchWaitlist, fetchMyWaitlist, fetchVenueWeek,
  fetchVenueNextLessons, fetchCustomerCounters, fetchPublishedVenueCourses,
} from '@/lib/firebase/courses';
/** `providerId` undefined lists the public catalogue; `enabled: false` switches the query off (venue-scoped screens). */
export function useCourses(providerId?: string, enabled = true) {
  return useInfiniteQuery({ queryKey: ['courses', providerId ?? 'public'], enabled,
    queryFn: ({ pageParam }) => fetchCourses(providerId, pageParam),
    initialPageParam: undefined as Awaited<ReturnType<typeof fetchCourses>>['cursor'],
    refetchInterval: 30000, getNextPageParam: page => page.cursor });
}
export const useCourseSessions = (id?: string) => useQuery({ queryKey: ['courses', 'sessions', id],
  queryFn: () => fetchCourseSessions(id!), enabled: !!id, refetchInterval: 15000 });
export const useCourseEnrollments = (uid?: string, provider = false) => useQuery({
  queryKey: ['courses', 'enrollments', uid, provider], queryFn: () => fetchCourseEnrollments(uid!, provider),
  enabled: !!uid, refetchInterval: 15000 });
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
  queryFn: () => fetchVenueCourses(venueId!), enabled: !!venueId, refetchInterval: 30000 });
/** What a customer sees of a venue's courses (name, price, waitlist flag): published and eligible only. */
export const usePublishedVenueCourses = (venueId?: string) => useQuery({ queryKey: ['courses', 'venuePublished', venueId],
  queryFn: () => fetchPublishedVenueCourses(venueId!), enabled: !!venueId, refetchInterval: 60000 });
export const useVenueEnrollments = (venueId?: string) => useQuery({ queryKey: ['courses', 'venueEnrollments', venueId],
  queryFn: () => fetchVenueEnrollments(venueId!), enabled: !!venueId, refetchInterval: 15000 });
export const useVenueRefunds = (venueId?: string) => useQuery({ queryKey: ['courses', 'venueRefunds', venueId],
  queryFn: () => fetchVenueRefunds(venueId!), enabled: !!venueId });
export const useWaitlist = (courseId?: string, sessionId?: string) => useQuery({
  queryKey: ['courses', 'waitlist', courseId, sessionId], queryFn: () => fetchWaitlist(courseId!, sessionId!),
  enabled: !!courseId && !!sessionId });
export const useMyWaitlist = (uid?: string) => useQuery({ queryKey: ['courses', 'myWaitlist', uid],
  queryFn: () => fetchMyWaitlist(uid!), enabled: !!uid, refetchInterval: 15000 });
export const useVenueWeek = (venueId?: string, weekStart?: string) => useQuery({
  queryKey: ['courses', 'venueWeek', venueId, weekStart], queryFn: () => fetchVenueWeek(venueId!, weekStart!),
  enabled: !!venueId && !!weekStart, refetchInterval: 30000 });
export const useVenueNextLessons = (venueId?: string, count = 3) => useQuery({
  queryKey: ['courses', 'venueNext', venueId, count], queryFn: () => fetchVenueNextLessons(venueId!, count),
  enabled: !!venueId, refetchInterval: 30000 });
export const useCustomerCounters = (courseId?: string, enabled = true) => useQuery({
  queryKey: ['courses', 'customers', courseId], queryFn: () => fetchCustomerCounters(courseId!), enabled: !!courseId && enabled });
export function useRefreshCourses() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['courses'] });
}
