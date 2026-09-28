import { Suspense } from 'react';
import ProviderReviewsClient from './ProviderReviewsClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Public provider reviews, addressed as `/providers/reviews?id=<providerId>`.
 * Replaces `/provider/[id]/reviews` — see `/providers/detail` and src/lib/routes.ts.
 */
export default function ProviderReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background-dark flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <ProviderReviewsClient />
    </Suspense>
  );
}
