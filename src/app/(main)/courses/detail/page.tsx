import { Suspense } from 'react';
import { CourseDetailPage } from '@/components/courses/CourseDetailPage';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Course detail, addressed as `/courses/detail?id=<courseId>&lesson=<sessionId>`.
 *
 * A `[id]` segment cannot serve Firestore ids under `output: 'export'` (`dynamicParams = false`), so this follows the
 * `/bookings/detail?id=` and `/chat/detail?id=` convention.
 */
export default function CourseDetailRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><Spinner size="md" /></div>}>
      <CourseDetailPage />
    </Suspense>
  );
}
