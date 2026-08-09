'use client';

/**
 * The recipe generation form — P2-6.
 *
 * READ THIS BEFORE ADDING A FIELD. This form is the client half of the legal guardrail in
 * spec §2: everything it can express is an enum, and the one free-text field accepts letters
 * only. There is deliberately no `clientId`, no kcal target, no weight and no "condition"
 * field — the callable rejects them outright, and the form must never grow one.
 *
 * `excludes` is labelled a PREFERENCE, never an intolerance or an allergy (spec §7.1). A
 * preference is a taste; an intolerance is a diagnosis, and collecting diagnoses is what puts
 * the platform on the wrong side of the line.
 */

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { aiGenerateRecipes } from '@/lib/firebase/recipes';
import {
  BUDGETS, CUISINES, DIET_STYLES, EXCLUSIONS, ORIENTATIONS, PREP_TIMES,
  type Budget, type Cuisine, type DietStyle, type Exclusion, type Orientation,
  type PrepTime, type Recipe, type RecipeParams,
} from '@/types/recipes';
import { RecipeDisclaimer } from './RecipeDisclaimer';

/** Mirrors `functions/src/recipes/screening.ts`. Letters, spaces, apostrophes, hyphens. */
const INGREDIENT_PATTERN = /^[\p{L}][\p{L}\s'’-]{1,29}$/u;
const INGREDIENT_MAX_LENGTH = 30;
const INGREDIENTS_MAX_ITEMS = 6;
const EXCLUDES_MAX = 4;

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * Map an error from `generateRecipes` to a localized message.
 *
 * The `forbidden-input:` prefix carries a discriminator. `too-long`, `too-many-items` and
 * `invalid-characters` are mechanical rules the user can fix, so they get a specific message.
 * Anything else is a denylist stem — naming the matched term back to the user would teach
 * filter evasion, so that case falls through to the generic legal explanation.
 */
export function recipeGenerateErrorMessage(err: unknown, t: Translate): string {
  const asObj = typeof err === 'object' && err !== null ? (err as { code?: unknown; message?: unknown }) : {};
  const code = typeof asObj.code === 'string' ? asObj.code : '';
  const message = typeof asObj.message === 'string' ? asObj.message : '';

  if (message.includes('forbidden-input')) {
    const term = message.slice(message.indexOf('forbidden-input') + 'forbidden-input:'.length);
    if (term === 'too-long') return t('recipes.error.inputTooLong');
    if (term === 'too-many-items') return t('recipes.error.inputTooManyItems');
    if (term === 'invalid-characters') return t('recipes.error.inputInvalidCharacters');
    return t('recipes.forbiddenInput');
  }
  if (code === 'functions/resource-exhausted') return t('recipes.error.quota');
  if (code === 'functions/failed-precondition') return t('recipes.error.disabled');
  if (message.includes('generation-unusable')) return t('recipes.error.unusable');
  return t('recipes.error.generic');
}

export interface RecipeGenerateModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (recipes: Recipe[]) => void;
  locale: string;
}

const selectClass =
  'w-full min-h-11 bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content outline-none focus:border-section-primary';
const labelClass = 'block text-xs font-medium text-content-muted mb-1';

export function RecipeGenerateModal({ open, onClose, onGenerated, locale }: RecipeGenerateModalProps) {
  const { t } = useI18n();

  const [count, setCount] = useState(1);
  const [servings, setServings] = useState(2);
  const [dietStyle, setDietStyle] = useState<DietStyle>('onnivora');
  const [excludes, setExcludes] = useState<Exclusion[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('piatto_unico');
  const [cuisine, setCuisine] = useState<Cuisine>('qualsiasi');
  const [maxPrepMinutes, setMaxPrepMinutes] = useState<PrepTime>(30);
  const [budget, setBudget] = useState<Budget>('qualsiasi');

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggleExclude = (value: Exclusion) => {
    setExcludes((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= EXCLUDES_MAX) return prev;
      return [...prev, value];
    });
  };

  /**
   * Reject client-side with the same message the server would return, so the common typo
   * ("2 uova") never costs a round trip — and never costs quota either.
   */
  const addIngredient = () => {
    const value = ingredientDraft.trim().normalize('NFC');
    if (!value) return;
    if (ingredients.length >= INGREDIENTS_MAX_ITEMS) {
      setError(t('recipes.error.inputTooManyItems'));
      return;
    }
    if (value.length > INGREDIENT_MAX_LENGTH) {
      setError(t('recipes.error.inputTooLong'));
      return;
    }
    if (!INGREDIENT_PATTERN.test(value)) {
      setError(t('recipes.error.inputInvalidCharacters'));
      return;
    }
    setError(null);
    setIngredients((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setIngredientDraft('');
  };

  const removeIngredient = (value: string) =>
    setIngredients((prev) => prev.filter((v) => v !== value));

  const close = () => {
    if (generating) return;
    setError(null);
    onClose();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const params: RecipeParams = {
        count,
        servings,
        dietStyle,
        excludes,
        orientation,
        cuisine,
        maxPrepMinutes,
        budget,
        ...(ingredients.length ? { ingredientsOnHand: ingredients } : {}),
      };
      const { recipes } = await aiGenerateRecipes(params, locale);
      onGenerated(recipes);
      onClose();
    } catch (e) {
      setError(recipeGenerateErrorMessage(e, t));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal onClose={close} className="w-full max-w-lg">
      <div className="bg-surface rounded-2xl border border-hairline p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-content flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-section-primary" aria-hidden />
            {t('recipes.form.title')}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={generating}
            aria-label={t('common.close')}
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center text-content-muted hover:text-content rounded-lg disabled:opacity-50"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* Spec §12.1: the notice renders in the library header AND inside this modal. */}
        <p className="rounded-lg border border-warning-DEFAULT/40 bg-warning-DEFAULT/10 px-3 py-2 text-xs text-content">
          {t('recipes.trainerNotice')}
        </p>
        <RecipeDisclaimer />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="recipe-count">{t('recipes.form.count')}</label>
            <select
              id="recipe-count"
              className={selectClass}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="recipe-servings">{t('recipes.form.servings')}</label>
            <select
              id="recipe-servings"
              className={selectClass}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="recipe-diet-style">{t('recipes.form.dietStyle')}</label>
          <select
            id="recipe-diet-style"
            className={selectClass}
            value={dietStyle}
            onChange={(e) => setDietStyle(e.target.value as DietStyle)}
          >
            {DIET_STYLES.map((v) => (
              <option key={v} value={v}>{t(`recipes.dietStyle.${v}`)}</option>
            ))}
          </select>
        </div>

        {/* PREFERENCES. Never "intolleranze", never "allergie" — spec §7.1. */}
        <fieldset>
          <legend className={labelClass}>{t('recipes.form.excludes')}</legend>
          <div className="flex flex-wrap gap-2">
            {EXCLUSIONS.map((v) => {
              const active = excludes.includes(v);
              const full = !active && excludes.length >= EXCLUDES_MAX;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleExclude(v)}
                  disabled={full}
                  aria-pressed={active}
                  className={cn(
                    'min-h-11 px-3 rounded-full border text-sm',
                    active
                      ? 'border-section-primary bg-section-primary/20 text-section-primary'
                      : 'border-hairline bg-surface-input text-content-muted',
                    full && 'opacity-40',
                  )}
                >
                  {t(`recipes.excludes.${v}`)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-content-muted mt-2">{t('recipes.form.excludesHint')}</p>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="recipe-orientation">{t('recipes.form.orientation')}</label>
            <select
              id="recipe-orientation"
              className={selectClass}
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
            >
              {ORIENTATIONS.map((v) => (
                <option key={v} value={v}>{t(`recipes.orientation.${v}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="recipe-cuisine">{t('recipes.form.cuisine')}</label>
            <select
              id="recipe-cuisine"
              className={selectClass}
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value as Cuisine)}
            >
              {CUISINES.map((v) => (
                <option key={v} value={v}>{t(`recipes.cuisine.${v}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="recipe-prep">{t('recipes.form.maxPrepMinutes')}</label>
            <select
              id="recipe-prep"
              className={selectClass}
              value={maxPrepMinutes}
              onChange={(e) => setMaxPrepMinutes(Number(e.target.value) as PrepTime)}
            >
              {PREP_TIMES.map((v) => (
                <option key={v} value={v}>{v} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="recipe-budget">{t('recipes.form.budget')}</label>
            <select
              id="recipe-budget"
              className={selectClass}
              value={budget}
              onChange={(e) => setBudget(e.target.value as Budget)}
            >
              {BUDGETS.map((v) => (
                <option key={v} value={v}>{t(`recipes.budget.${v}`)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="recipe-ingredient">{t('recipes.form.ingredients')}</label>
          <div className="flex gap-2">
            <input
              id="recipe-ingredient"
              type="text"
              value={ingredientDraft}
              maxLength={INGREDIENT_MAX_LENGTH}
              onChange={(e) => setIngredientDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addIngredient();
                }
              }}
              className={cn(selectClass, 'flex-1 placeholder:text-content-muted')}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={addIngredient}
              disabled={!ingredientDraft.trim() || ingredients.length >= INGREDIENTS_MAX_ITEMS}
            >
              {t('clients.common.addIngredient')}
            </Button>
          </div>
          <p className="text-xs text-content-muted mt-1">{t('recipes.form.ingredientsHint')}</p>
          {ingredients.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ingredients.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-input pl-3 text-sm text-content"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => removeIngredient(value)}
                    aria-label={`${t('clients.common.remove')}: ${value}`}
                    className="w-11 h-11 flex items-center justify-center text-content-muted hover:text-content"
                  >
                    <X className="w-3 h-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
          <Button size="sm" variant="outline" onClick={close} disabled={generating}>
            {t('clients.common.cancel')}
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('recipes.form.generating')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" aria-hidden />
                {t('recipes.form.generateButton')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default RecipeGenerateModal;
