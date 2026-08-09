'use client';

/**
 * Recipes shared with ONE client — P2-6, spec §12.
 *
 * THERE IS NO GENERATE BUTTON HERE, AND THERE MUST NEVER BE ONE. Generation is not
 * per-client: the `generateRecipes` callable has no `clientId` parameter, because a recipe
 * produced for a named person from their data is a personalized diet, which an Italian
 * personal trainer may not issue. This tab only shares recipes that already exist in the
 * trainer's library — see `/provider/recipes`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { useProviderStore } from '@/stores/providerStore';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { RecipeDisclaimer } from '@/components/recipes/RecipeDisclaimer';
import { listMyRecipes, listSharedWithClient, shareRecipe, unshareRecipe } from '@/lib/firebase/recipes';
import type { Recipe } from '@/types/recipes';

export default function RecipesTab({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const currentClient = useProviderStore((s) => s.currentClient);
  // Guarded on id: the store can still hold the previously opened client mid-fetch, and
  // sharing a recipe with the wrong person is not a mistake worth risking.
  const clientUserId = currentClient?.id === clientId ? currentClient.userId : undefined;

  const [shared, setShared] = useState<Recipe[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [library, setLibrary] = useState<Recipe[] | null>(null);

  const reload = useCallback(async () => {
    if (!clientUserId) {
      setShared([]);
      return;
    }
    try {
      setShared(await listSharedWithClient(clientUserId));
    } catch (e) {
      console.error('[RecipesTab] load failed', e);
      setShared([]);
    }
  }, [clientUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPicker = async () => {
    setShowPicker(true);
    if (library) return;
    try {
      setLibrary(await listMyRecipes());
    } catch (e) {
      console.error('[RecipesTab] library load failed', e);
      setLibrary([]);
    }
  };

  const toggleShare = async (recipe: Recipe, share: boolean) => {
    if (!clientUserId || busy) return;
    setBusy(recipe.id);
    try {
      if (share) await shareRecipe(recipe.id, clientUserId);
      else await unshareRecipe(recipe.id, clientUserId);
      setLibrary((prev) =>
        prev?.map((r) =>
          r.id === recipe.id
            ? {
                ...r,
                sharedWithUserIds: share
                  ? [...(r.sharedWithUserIds ?? []), clientUserId]
                  : (r.sharedWithUserIds ?? []).filter((u) => u !== clientUserId),
              }
            : r,
        ) ?? prev,
      );
      await reload();
    } catch (e) {
      console.error('[RecipesTab] share toggle failed', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-content">{t('recipes.title')}</h3>
        <Button size="sm" onClick={openPicker} disabled={!clientUserId}>
          <Share2 className="w-4 h-4 mr-2" aria-hidden />
          {t('recipes.shareFromLibrary')}
        </Button>
      </div>

      <RecipeDisclaimer />

      {!clientUserId ? (
        <p className="text-sm text-content-muted">{t('recipes.shareModal.noAccount')}</p>
      ) : shared === null ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : shared.length === 0 ? (
        <p className="text-sm text-content-muted">{t('recipes.emptySharedWithClient')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shared.map((recipe) => (
            <div key={recipe.id} className="space-y-2">
              {/* Read-only: editing and deleting belong to the library, not to a share. */}
              <RecipeCard recipe={recipe} shared />
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleShare(recipe, false)}
                disabled={busy === recipe.id}
              >
                {busy === recipe.id ? <Spinner size="sm" /> : t('recipes.unshare')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <Modal onClose={() => setShowPicker(false)} className="w-full max-w-md">
          <div className="bg-surface rounded-2xl border border-hairline p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-content">{t('recipes.shareFromLibrary')}</h4>
            <RecipeDisclaimer />

            {library === null ? (
              <div className="flex justify-center py-6">
                <Spinner size="md" />
              </div>
            ) : library.length === 0 ? (
              <p className="text-sm text-content-muted">{t('recipes.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {library.map((recipe) => {
                  const isShared = !!clientUserId && (recipe.sharedWithUserIds ?? []).includes(clientUserId);
                  return (
                    <li
                      key={recipe.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-input px-3 py-2"
                    >
                      <span className="text-sm text-content min-w-0 break-words">{recipe.title}</span>
                      <Button
                        size="sm"
                        variant={isShared ? 'outline' : 'primary'}
                        onClick={() => toggleShare(recipe, !isShared)}
                        disabled={busy === recipe.id}
                        className="shrink-0"
                      >
                        {busy === recipe.id ? (
                          <Spinner size="sm" />
                        ) : isShared ? (
                          t('recipes.unshare')
                        ) : (
                          t('recipes.share')
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowPicker(false)}>
                {t('recipes.shareModal.done')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
