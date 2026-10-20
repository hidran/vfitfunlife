import { Suspense } from 'react';
import { ProviderCourses } from '@/components/courses/ProviderCourses';
export default function ProviderCoursesPage() {
  return <Suspense><ProviderCourses /></Suspense>;
}
