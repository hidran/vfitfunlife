import { Suspense } from 'react';
import { VenueTimetable } from '@/components/courses/VenueTimetable';

export default function GymTimetablePage() {
  return <Suspense><VenueTimetable /></Suspense>;
}
