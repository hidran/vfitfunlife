import { Suspense } from 'react';
import RecipesLibraryClient from './RecipesLibraryClient';
import { Spinner } from '@/components/ui/Spinner';

export default function ProviderRecipesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <RecipesLibraryClient />
    </Suspense>
  );
}
