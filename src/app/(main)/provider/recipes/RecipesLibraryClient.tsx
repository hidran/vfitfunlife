'use client';

/**
 * The trainer's recipe library — P2-6, spec §12.
 *
 * Generation lives HERE and nowhere else. A recipe is owned by whoever generated it and is
 * not addressed to anybody; sharing it with a named client is a separate, deliberate act
 * (spec §9). That is why the client-detail tab has no generate button: a recipe produced
 * "for" a named person, from their data, is a personalized diet, which an Italian personal
 * trainer may not issue.
 *
 * The header carries both fixed legal strings — the disclaimer and the trainer notice.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/hooks/useI18n';
import { useProviderStore } from '@/stores/providerStore';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { RecipeDisclaimer } from '@/components/recipes/RecipeDisclaimer';
import { RecipeGenerateModal } from '@/components/recipes/RecipeGenerateModal';
import { ShareRecipeModal } from '@/components/recipes/ShareRecipeModal';
import { createRecipe, deleteRecipe, listMyRecipes, updateRecipe } from '@/lib/firebase/recipes';
import type { Recipe } from '@/types/recipes';
import RecipeEditor, { type RecipeEditorPayload } from '../clients/detail/tabs/editors/RecipeEditor';

export default function RecipesLibraryClient() {
  const { t, locale } = useI18n();
  const clients = useProviderStore((s) => s.clients);
  const fetchClients = useProviderStore((s) => s.fetchClients);

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [sharing, setSharing] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRecipes(await listMyRecipes());
    } catch (e) {
      console.error('[RecipesLibrary] load failed', e);
      setRecipes([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // The share picker needs the roster; loading it up front keeps opening the modal instant.
  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
  };

  const handleSave = async (data: RecipeEditorPayload) => {
    setSaving(true);
    try {
      if (editing) await updateRecipe(editing.id, data);
      else await createRecipe(data, 'provider');
      closeEditor();
      await reload();
    } catch (e) {
      console.error('[RecipesLibrary] save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await deleteRecipe(id);
      await reload();
    } catch (e) {
      console.error('[RecipesLibrary] delete failed', e);
    } finally {
      setSaving(false);
    }
  };

  if (showEditor) {
    return (
      <div className="space-y-4">
        <RecipeDisclaimer />
        <RecipeEditor initial={editing} saving={saving} onSave={handleSave} onCancel={closeEditor} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-content">{t('recipes.title')}</h1>
            <p className="text-sm text-content-muted">{t('recipes.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowGenerate(true)}>
              <Sparkles className="w-4 h-4 mr-2" aria-hidden />
              {t('recipes.generate')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setShowEditor(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" aria-hidden />
              {t('recipes.newManual')}
            </Button>
          </div>
        </div>

        {/* Both strings are fixed legal copy (spec §12.1). Neither is optional. */}
        <p className="rounded-lg border border-warning-DEFAULT/40 bg-warning-DEFAULT/10 px-3 py-2 text-sm text-content">
          {t('recipes.trainerNotice')}
        </p>
        <RecipeDisclaimer />
      </header>

      {recipes === null ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-sm text-content-muted">{t('recipes.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              shared={(recipe.sharedWithUserIds ?? []).length > 0}
              onShare={() => setSharing(recipe)}
              onEdit={() => {
                setEditing(recipe);
                setShowEditor(true);
              }}
              onDelete={() => handleDelete(recipe.id)}
            />
          ))}
        </div>
      )}

      <RecipeGenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerated={() => void reload()}
        locale={locale}
        audience="provider"
      />

      {sharing && (
        <ShareRecipeModal
          recipe={sharing}
          clients={clients}
          onClose={() => {
            setSharing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
