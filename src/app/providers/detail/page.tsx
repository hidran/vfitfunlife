import { Suspense } from 'react';
import ProviderProfileClient from './ProviderProfileClient';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Public provider profile, addressed as `/providers/detail?id=<providerId>`.
 *
 * Replaces `/provider/[id]`: under `output: 'export'` a `[id]` segment only serves the ids
 * listed by generateStaticParams, so every real provider 404'd. It also moves out of
 * `/provider/*`, which is the provider dashboard. Legacy links are forwarded by firebase.json.
 * Same query-string convention as `/bookings/detail`. See src/lib/routes.ts.
 */
export default function ProviderProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background-dark flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <ProviderProfileClient />
    </Suspense>
  );
}
