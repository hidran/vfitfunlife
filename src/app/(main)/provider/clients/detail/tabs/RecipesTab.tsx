'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, ChefHat, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  aiGenerateRecipe,
} from '@/lib/firebase/clientPlans';
import type { Recipe, RecipeParams } from '@/types/clientPlans';
import RecipeEditor from './editors/RecipeEditor';
import { aiGenerateErrorMessage } from './aiGenerateError';

const aiInput =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';
const aiLabel = 'block text-xs font-medium text-content-muted mb-1';

export default function RecipesTab({ clientId }: { clientId: string }) {
  const { t, locale } = useI18n();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  // AI generation params form
  const [showAi, setShowAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mealType, setMealType] = useState('');
  const [servings, setServings] = useState('2');
  const [constraints, setConstraints] = useState('');
  const [mustUse, setMustUse] = useState('');
  const [avoid, setAvoid] = useState('');
  const [targetKcal, setTargetKcal] = useState('');
  const [targetProtein, setTargetProtein] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setAiError(null);
    try {
      const macros: NonNullable<RecipeParams['targetMacros']> = {};
      if (targetKcal.trim() && !Number.isNaN(parseInt(targetKcal, 10))) macros.kcal = parseInt(targetKcal, 10);
      if (targetProtein.trim() && !Number.isNaN(parseInt(targetProtein, 10))) macros.protein = parseInt(targetProtein, 10);
      const params: RecipeParams = {
        servings: parseInt(servings, 10) || 2,
        ...(mealType.trim() ? { mealType: mealType.trim() } : {}),
        ...(constraints.trim() ? { constraints: constraints.trim() } : {}),
        ...(mustUse.trim() ? { mustUse: mustUse.trim() } : {}),
        ...(avoid.trim() ? { avoid: avoid.trim() } : {}),
        ...(Object.keys(macros).length ? { targetMacros: macros } : {}),
      };
      const created = await aiGenerateRecipe(clientId, params, locale);
      setShowAi(false);
      await reload();
      setEditing(created);
      setShowEditor(true);
    } catch (e) {
      setAiError(aiGenerateErrorMessage(e, t));
    } finally {
      setGenerating(false);
    }
  };

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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAiError(null); setShowAi(true); }}>
            <Sparkles className="w-4 h-4 mr-2" />
            {t('clients.aiGenerate.button')}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            {t('clients.recipes.new')}
          </Button>
        </div>
      </div>

      {showAi && (
        <Modal onClose={() => (generating ? undefined : setShowAi(false))} className="w-full max-w-md">
          <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-content flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-section-primary" />
                {t('clients.aiGenerate.recipe.title')}
              </h4>
              <button
                onClick={() => setShowAi(false)}
                disabled={generating}
                className="p-1 text-gray-400 hover:text-content rounded disabled:opacity-50"
                aria-label={t('clients.common.cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.recipe.mealType')}</label>
                <input className={aiInput} value={mealType} onChange={(e) => setMealType(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.recipe.servings')}</label>
                <input className={aiInput} type="number" min={1} max={12} value={servings} onChange={(e) => setServings(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.recipe.constraints')}</label>
              <input className={aiInput} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.recipe.mustUse')}</label>
              <input className={aiInput} value={mustUse} onChange={(e) => setMustUse(e.target.value)} />
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.recipe.avoid')}</label>
              <input className={aiInput} value={avoid} onChange={(e) => setAvoid(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.recipe.targetKcal')}</label>
                <input className={aiInput} type="number" value={targetKcal} onChange={(e) => setTargetKcal(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.recipe.targetProtein')}</label>
                <input className={aiInput} type="number" value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} />
              </div>
            </div>

            {aiError && <p className="text-sm text-red-400">{aiError}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" onClick={() => setShowAi(false)} disabled={generating}>
                {t('clients.common.cancel')}
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? <Spinner size="sm" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {t('clients.aiGenerate.generate')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
