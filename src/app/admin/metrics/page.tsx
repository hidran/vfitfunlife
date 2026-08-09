import { Suspense } from 'react';
import MetricsClient from './MetricsClient';
import { Spinner } from '@/components/ui/Spinner';

export default function AdminMetricsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <MetricsClient />
    </Suspense>
  );
}
