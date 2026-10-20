import { Suspense } from 'react';
import { CourseRoster } from '@/components/courses/CourseRoster';

/** Course participants, addressed as `/provider/courses/detail?id=<courseId>&venue=<venueId>&lesson=<sessionId>`. */
export default function ProviderCourseDetailPage() {
  return <Suspense><CourseRoster /></Suspense>;
}
