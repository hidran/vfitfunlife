'use client';

/**
 * "Ricette" — the client's own recipe screen (P2-6, spec §12).
 *
 * Two lists, both driven by the query shapes of spec §6.4: what the trainer shared with me
 * (`sharedWithUserIds array-contains uid`, read-only) and what I generated myself
 * (`ownerUid == uid`, deletable).
 *
 * A client can generate here, at a lower daily quota (spec §8.2) — that is an intended use,
 * not an exception. What they cannot do is ask for anything personalized: this screen reuses
 * the trainer's `RecipeGenerateModal` unchanged, which offers closed enums plus a policed
 * ingredient box and has no field for a person, a weight, a calorie target or a condition.
 * The modal takes no `ownerRole` prop on purpose — the callable derives ownership from the
 * caller's own auth token, the only place it can be trusted.
 *
 * `RecipeDisclaimer` is mandatory here as on every other recipe surface (spec §12.1).
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { RecipeDisclaimer } from '@/components/recipes/RecipeDisclaimer';
import { RecipeGenerateModal } from '@/components/recipes/RecipeGenerateModal';
import { deleteRecipe, listMyRecipes, listSharedWithMe } from '@/lib/firebase/recipes';
import { queryKeys } from '@/lib/queryKeys';

export default function RecipesClient() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const [showGenerate, setShowGenerate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Two independent queries (rather than one Promise.allSettled effect) so a denied read on
  // one list can't blank the other's already-cached data, and each has its own loading state.
  const sharedQuery = useQuery({
    queryKey: queryKeys.recipesSharedWithMe(),
    queryFn: listSharedWithMe,
  });
  const mineQuery = useQuery({
    queryKey: queryKeys.recipesMine(),
    queryFn: listMyRecipes,
  });
  const shared = sharedQuery.data ?? (sharedQuery.isError ? [] : null);
  const mine = mineQuery.data ?? (mineQuery.isError ? [] : null);

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.recipesSharedWithMe() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.recipesMine() }),
    ]);
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteRecipe(id);
      await reload();
    } catch (e) {
      console.error('[Recipes] delete failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 pb-28">
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-content">{t('recipes.title')}</h1>
            <p className="text-sm text-content-muted">{t('recipes.subtitle')}</p>
          </div>
          <Button size="sm" onClick={() => setShowGenerate(true)}>
            <Sparkles className="w-4 h-4 mr-2" aria-hidden />
            {t('recipes.generate')}
          </Button>
        </div>

        {/* Fixed legal copy (spec §12.1). Not optional, not dismissible. */}
        <RecipeDisclaimer />
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-content">{t('recipes.sharedByTrainer')}</h2>
        {shared === null ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : shared.length === 0 ? (
          <p className="text-sm text-content-muted">{t('recipes.emptyShared')}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {shared.map((recipe) => (
              // Read-only: the trainer owns these, so no edit, no delete, no re-share.
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-content">{t('recipes.myRecipes')}</h2>
        {mine === null ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : mine.length === 0 ? (
          <p className="text-sm text-content-muted">{t('recipes.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mine.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} onDelete={() => handleDelete(recipe.id)} />
            ))}
          </div>
        )}
      </section>

      <RecipeGenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerated={() => void reload()}
        locale={locale}
      />
    </div>
  );
}
