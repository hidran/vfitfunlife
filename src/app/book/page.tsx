import { Suspense } from 'react';
import BookingClient from './BookingClient';
import { Spinner } from '@/components/ui/Spinner';

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background-dark">
          <Spinner size="md" />
        </div>
      }
    >
      <BookingClient />
    </Suspense>
  );
}
