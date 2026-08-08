import { Suspense } from 'react';
import BookingDetailClient from '../[id]/BookingDetailClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Trainer booking detail, addressed as `/provider/bookings/detail?id=<bookingId>`.
 *
 * See the client-side twin at `/bookings/detail` — the `[id]` route only builds a
 * `placeholder` under static export, so every real booking id 404s.
 */
export default function ProviderBookingDetailPage() {
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
