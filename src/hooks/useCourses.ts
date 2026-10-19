import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCourses, fetchCourseSessions, fetchCourseEnrollments, fetchCourseParticipants, fetchCourseRefunds } from '@/lib/firebase/courses';
export function useCourses(providerId?: string) {
  return useInfiniteQuery({ queryKey: ['courses', providerId ?? 'public'],
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
export function useRefreshCourses() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['courses'] });
}
