import { Suspense } from 'react';
import { CourseEditorPage } from '@/components/courses/CourseEditorPage';
export default function EditCoursePage() {
  return <Suspense><CourseEditorPage editing /></Suspense>;
}
