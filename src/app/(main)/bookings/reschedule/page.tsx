import { Suspense } from 'react';
import BookingRescheduleClient from './BookingRescheduleClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Reschedule a booking, addressed as `/bookings/reschedule/?id=<bookingId>`.
 *
 * It used to live under `bookings/[id]/reschedule`, where it was unreachable: `output: 'export'`
 * forces `dynamicParams = false`, so the only page ever built was the single `placeholder` id
 * generateStaticParams returned and every real id 404'd. Same query-string convention as the
 * sibling `/bookings/detail`.
 */
export default function BookingReschedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <BookingRescheduleClient />
    </Suspense>
  );
}
