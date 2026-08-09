import { Suspense } from 'react';
import RecipesClient from './RecipesClient';
import { Spinner } from '@/components/ui/Spinner';

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <RecipesClient />
    </Suspense>
  );
}
