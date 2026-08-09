'use client';

/**
 * Trainer-only share picker — P2-6, spec §9.
 *
 * A recipe is born attached to nobody, so the trainer's deliberate share is the human review
 * gate; there is no draft/published status. A roster entry without a linked `userId` cannot
 * read anything, so it renders disabled with an explanation rather than being hidden — the
 * trainer needs to know why the client is not in the list.
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { shareRecipe, unshareRecipe } from '@/lib/firebase/recipes';
import type { Recipe } from '@/types/recipes';

/** Structurally satisfied by `ProviderClient`. */
export interface ShareTarget {
  id: string;
  name: string;
  userId?: string;
}

export interface ShareRecipeModalProps {
  recipe: Recipe;
  clients: ShareTarget[];
  onClose: () => void;
}

export function ShareRecipeModal({ recipe, clients, onClose }: ShareRecipeModalProps) {
  const { t } = useI18n();
  const [sharedWith, setSharedWith] = useState<string[]>(recipe.sharedWithUserIds ?? []);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (userId: string) => {
    if (busy) return;
    const wasShared = sharedWith.includes(userId);
    setBusy(userId);
    // Optimistic: the row flips immediately, and reverts if the write is rejected.
    setSharedWith((prev) => (wasShared ? prev.filter((u) => u !== userId) : [...prev, userId]));
    try {
      if (wasShared) await unshareRecipe(recipe.id, userId);
      else await shareRecipe(recipe.id, userId);
    } catch (e) {
      console.error('[ShareRecipeModal] share toggle failed', e);
      setSharedWith((prev) => (wasShared ? [...prev, userId] : prev.filter((u) => u !== userId)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <div className="bg-surface rounded-2xl border border-hairline p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-content">{t('recipes.shareModal.title')}</h2>
            <p className="text-sm text-content-muted">{recipe.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center text-content-muted hover:text-content rounded-lg"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {clients.length === 0 ? (
          <p className="text-sm text-content-muted">{t('recipes.shareModal.noClients')}</p>
        ) : (
          <ul className="space-y-2">
            {clients.map((client) => {
              const userId = client.userId;
              const isShared = !!userId && sharedWith.includes(userId);
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => userId && toggle(userId)}
                    disabled={!userId || busy === userId}
                    aria-pressed={isShared}
                    className={cn(
                      'w-full min-h-11 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left',
                      isShared
                        ? 'border-section-primary bg-section-primary/10'
                        : 'border-hairline bg-surface-input',
                      !userId && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-content truncate">{client.name}</span>
                      {!userId && (
                        <span className="block text-xs text-content-muted">
                          {t('recipes.shareModal.noAccount')}
                        </span>
                      )}
                    </span>
                    {busy === userId ? (
                      <Spinner size="sm" />
                    ) : isShared ? (
                      <Check className="w-4 h-4 text-section-primary shrink-0" aria-hidden />
                    ) : (
                      <span className="text-xs text-content-muted shrink-0">{t('recipes.share')}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>{t('recipes.shareModal.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default ShareRecipeModal;
