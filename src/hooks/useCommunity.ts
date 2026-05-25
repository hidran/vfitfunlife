import { useQuery } from '@tanstack/react-query';
import { fetchTestimonials, fetchInstructorReviews } from '@/lib/firebase/community';

const STALE_5_MIN = 5 * 60 * 1000;

export function useTestimonials(opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['testimonials', opts],
    queryFn: () => fetchTestimonials(opts),
    staleTime: STALE_5_MIN,
  });
}

export function useInstructorReviews(instructorId: string | undefined, opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['instructor-reviews', instructorId, opts],
    queryFn: () => fetchInstructorReviews(instructorId as string, opts),
    enabled: !!instructorId && instructorId !== 'placeholder',
    staleTime: STALE_5_MIN,
  });
}
