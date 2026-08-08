import { Suspense } from 'react';
import BookingDetailClient from '../[id]/BookingDetailClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Booking detail, addressed as `/bookings/detail?id=<bookingId>`.
 *
 * The sibling `[id]` route cannot serve real bookings: `output: 'export'` forces
 * `dynamicParams = false`, so only the ids returned by generateStaticParams are built —
 * a single `placeholder`. Every other id 404s. This mirrors the query-string convention
 * already used by `/provider/clients/detail`.
 */
export default function BookingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <BookingDetailClient />
    </Suspense>
  );
}
