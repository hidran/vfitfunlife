import { Suspense } from 'react';
import PlansClient from './PlansClient';
import { Spinner } from '@/components/ui/Spinner';

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <PlansClient />
    </Suspense>
  );
}
