'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from '@/lib/firebase/clientPlans';
import type { Recipe } from '@/types/clientPlans';
import RecipeEditor from './editors/RecipeEditor';

export default function RecipesTab({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecipes(await listRecipes(clientId));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openNew = () => {
    setEditing(null);
    setShowEditor(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditing(recipe);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
  };

  const handleSave = async (data: {
    title: string;
    servings: number;
    prepMinutes?: number;
    cookMinutes?: number;
    ingredients: Recipe['ingredients'];
    steps: string[];
    nutrition?: Recipe['nutrition'];
    tags?: string[];
  }) => {
    setSaving(true);
    try {
      if (editing) {
        await updateRecipe(clientId, editing.id, data);
      } else {
        await createRecipe(clientId, data);
      }
      closeEditor();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await deleteRecipe(clientId, id);
      await reload();
    } catch (e) {
      console.error('[RecipesTab] delete failed', e);
    } finally {
      setSaving(false);
    }
  };

  if (showEditor) {
    return (
      <RecipeEditor
        initial={editing}
        saving={saving}
        onSave={handleSave}
        onCancel={closeEditor}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-content">{t('clients.recipes.heading')}</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.recipes.new')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('clients.recipes.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recipes.map((recipe) => {
            const timeParts: string[] = [];
            if (recipe.prepMinutes != null)
              timeParts.push(`${recipe.prepMinutes} ${t('clients.recipes.prepShort')}`);
            if (recipe.cookMinutes != null)
              timeParts.push(`${recipe.cookMinutes} ${t('clients.recipes.cookShort')}`);
            return (
              <div key={recipe.id} className="bg-surface-elevated rounded-xl border border-hairline p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                      <ChefHat className="w-5 h-5 text-section-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-content">{recipe.title}</p>
                      <p className="text-sm text-gray-400">
                        {recipe.servings} {t('clients.recipes.servingsLabel')}
                        {timeParts.length ? ` · ${timeParts.join(' · ')}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(recipe)}
                      className="p-1.5 text-gray-400 hover:text-content rounded"
                      aria-label={t('clients.common.edit')}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(recipe.id)}
                      disabled={saving}
                      className="p-1.5 text-red-400 hover:text-red-300 rounded disabled:opacity-50"
                      aria-label={t('clients.common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs',
                      recipe.source === 'ai'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-section-primary/20 text-section-primary'
                    )}
                  >
                    {recipe.source === 'ai'
                      ? t('clients.common.aiBadge')
                      : t('clients.common.manualBadge')}
                  </span>
                  {(recipe.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-xs bg-surface-input text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
