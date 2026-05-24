import { Suspense } from 'react';
import VenueDetailClient from './VenueDetailClient';
import { Spinner } from '@/components/ui/Spinner';

export default function VenuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background-dark">
          <Spinner size="md" />
        </div>
      }
    >
      <VenueDetailClient />
    </Suspense>
  );
}
