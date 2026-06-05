'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { Recipe, RecipeIngredient, MacroTargets } from '@/types/clientPlans';

const inputClass =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';

interface EditorRecipe {
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition?: MacroTargets;
  tags?: string[];
}

function emptyIngredient(): RecipeIngredient {
  return { item: '', quantity: '' };
}

interface RecipeEditorProps {
  initial?: Recipe | null;
  saving?: boolean;
  onSave: (recipe: EditorRecipe) => void;
  onCancel: () => void;
}

export default function RecipeEditor({ initial, saving, onSave, onCancel }: RecipeEditorProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [servings, setServings] = useState<number>(initial?.servings ?? 1);
  const [prepMinutes, setPrepMinutes] = useState<string>(
    initial?.prepMinutes != null ? String(initial.prepMinutes) : ''
  );
  const [cookMinutes, setCookMinutes] = useState<string>(
    initial?.cookMinutes != null ? String(initial.cookMinutes) : ''
  );
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    initial?.ingredients?.length ? initial.ingredients : [emptyIngredient()]
  );
  const [steps, setSteps] = useState<string[]>(
    initial?.steps?.length ? initial.steps : ['']
  );
  const [kcal, setKcal] = useState<string>(
    initial?.nutrition?.kcal != null ? String(initial.nutrition.kcal) : ''
  );
  const [protein, setProtein] = useState<string>(
    initial?.nutrition?.protein != null ? String(initial.nutrition.protein) : ''
  );
  const [carbs, setCarbs] = useState<string>(
    initial?.nutrition?.carbs != null ? String(initial.nutrition.carbs) : ''
  );
  const [fat, setFat] = useState<string>(
    initial?.nutrition?.fat != null ? String(initial.nutrition.fat) : ''
  );
  const [tags, setTags] = useState<string>((initial?.tags ?? []).join(', '));

  const addIngredient = () => setIngredients([...ingredients, emptyIngredient()]);
  const removeIngredient = (i: number) =>
    setIngredients(ingredients.filter((_, idx) => idx !== i));
  const setIngredientField = (i: number, patch: Partial<RecipeIngredient>) => {
    const next = [...ingredients];
    next[i] = { ...next[i], ...patch };
    setIngredients(next);
  };

  const addStep = () => setSteps([...steps, '']);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const setStep = (i: number, value: string) => {
    const next = [...steps];
    next[i] = value;
    setSteps(next);
  };

  const optInt = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const n = parseInt(value, 10);
    return !isNaN(n) && n >= 0 ? n : undefined;
  };
  const optNum = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return !isNaN(n) && n >= 0 ? n : undefined;
  };

  const handleSave = () => {
    const nutrition: MacroTargets = {
      kcal: optNum(kcal),
      protein: optNum(protein),
      carbs: optNum(carbs),
      fat: optNum(fat),
    };
    const hasNutrition =
      nutrition.kcal != null ||
      nutrition.protein != null ||
      nutrition.carbs != null ||
      nutrition.fat != null;
    const tagList = tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      title: title.trim(),
      servings,
      prepMinutes: optInt(prepMinutes),
      cookMinutes: optInt(cookMinutes),
      ingredients: ingredients.filter((ing) => ing.item.trim() || ing.quantity.trim()),
      steps: steps.filter((s) => s.trim()),
      nutrition: hasNutrition ? nutrition : undefined,
      tags: tagList.length ? tagList : undefined,
    });
  };

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm text-gray-400 mb-1">{t('clients.recipes.title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('clients.recipes.servings')}</label>
          <input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 1) setServings(n);
            }}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('clients.recipes.prep')}</label>
            <input
              type="number"
              min={0}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('clients.recipes.cook')}</label>
            <input
              type="number"
              min={0}
              value={cookMinutes}
              onChange={(e) => setCookMinutes(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-content">{t('clients.recipes.ingredients')}</p>
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
            <input
              type="text"
              value={ing.item}
              onChange={(e) => setIngredientField(i, { item: e.target.value })}
              placeholder={t('clients.recipes.ingredient')}
              className={cn(inputClass, 'col-span-1 sm:col-span-7')}
            />
            <input
              type="text"
              value={ing.quantity}
              onChange={(e) => setIngredientField(i, { quantity: e.target.value })}
              placeholder={t('clients.recipes.quantity')}
              className={cn(inputClass, 'col-span-1 sm:col-span-4')}
            />
            <button
              onClick={() => removeIngredient(i)}
              className="p-1.5 text-red-400 hover:text-red-300 rounded justify-self-end sm:col-span-1"
              aria-label={t('clients.common.remove')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={addIngredient}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.common.addIngredient')}
        </Button>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-content">{t('clients.recipes.steps')}</p>
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-sm text-gray-400 pt-2.5 w-6 shrink-0 text-right">{i + 1}.</span>
            <textarea
              value={step}
              onChange={(e) => setStep(i, e.target.value)}
              placeholder={t('clients.recipes.step')}
              className={cn(inputClass, 'flex-1 min-h-[44px]')}
            />
            <button
              onClick={() => removeStep(i)}
              className="p-1.5 text-red-400 hover:text-red-300 rounded shrink-0 mt-1"
              aria-label={t('clients.common.remove')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={addStep}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.common.addStep')}
        </Button>
      </div>

      {/* Nutrition */}
      <div>
        <p className="text-sm font-semibold text-content mb-2">{t('clients.recipes.nutrition')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('clients.diet.kcal')}</label>
            <input
              type="number"
              min={0}
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('clients.diet.protein')}</label>
            <input
              type="number"
              min={0}
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('clients.diet.carbs')}</label>
            <input
              type="number"
              min={0}
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('clients.diet.fat')}</label>
            <input
              type="number"
              min={0}
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">{t('clients.recipes.tags')}</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={t('clients.recipes.tagsPlaceholder')}
          className={inputClass}
        />
      </div>

      <div className="flex gap-2 pt-2 border-t border-hairline">
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || servings < 1}>
          <Save className="w-4 h-4 mr-2" />
          {t('clients.common.save')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          <X className="w-4 h-4 mr-2" />
          {t('clients.common.cancel')}
        </Button>
      </div>
    </div>
  );
}
