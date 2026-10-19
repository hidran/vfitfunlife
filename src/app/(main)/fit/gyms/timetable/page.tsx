import { Suspense } from 'react';
import { GymTimetableClient } from '@/components/gym/GymTimetableClient';

export default function GymTimetablePage() {
  return <Suspense><GymTimetableClient /></Suspense>;
}
