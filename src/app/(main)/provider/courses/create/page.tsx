import { Suspense } from 'react';
import { CourseEditorPage } from '@/components/courses/CourseEditorPage';
export default function CreateCoursePage() {
  return <Suspense><CourseEditorPage /></Suspense>;
}
