import { Suspense } from 'react';
import BookingReviewClient from './BookingReviewClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Review a booking, addressed as `/bookings/review/?id=<bookingId>`.
 *
 * It used to live under `bookings/[id]/review`, where it was unreachable for real bookings:
 * `output: 'export'` forces `dynamicParams = false`, so only the `placeholder` id was ever
 * built. Same query-string convention as `/bookings/detail` and `/bookings/reschedule`.
 */
export default function BookingReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <BookingReviewClient />
    </Suspense>
  );
}
