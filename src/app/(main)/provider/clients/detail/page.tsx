import { Suspense } from 'react';
import ClientDetailClient from './ClientDetailClient';
import { Spinner } from '@/components/ui/Spinner';

export default function ClientDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <ClientDetailClient />
    </Suspense>
  );
}
