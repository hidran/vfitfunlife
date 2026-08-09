'use client';

/**
 * One recipe, collapsed to a summary and expandable to the full method — P2-6.
 *
 * Shared by the trainer library, the client-detail sharing tab and the client's own page.
 * Every action is opt-in through a handler prop: pass nothing and the card is read-only,
 * which is how a recipe shared *with* a client renders in the client app.
 *
 * Nutrition is always labelled `recipes.nutritionNote` ("valori indicativi per porzione").
 * These are indicative per-portion values, never targets — see spec §2.
 */

import { useState } from 'react';
import { ChefHat, ChevronDown, Edit, Share2, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { Recipe } from '@/types/recipes';

export interface RecipeCardProps {
  recipe: Recipe;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Renders the "condivisa" marker. Independent of `onShare` so a read-only card can show it. */
  shared?: boolean;
}

export function RecipeCard({ recipe, onShare, onEdit, onDelete, shared }: RecipeCardProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const nutrition = recipe.nutritionPerServing;
  const hasNutrition =
    !!nutrition &&
    (nutrition.kcal != null ||
      nutrition.protein != null ||
      nutrition.carbs != null ||
      nutrition.fat != null);

  const timeParts: string[] = [];
  if (recipe.prepMinutes != null) timeParts.push(`${recipe.prepMinutes} ${t('recipes.prepShort')}`);
  if (recipe.cookMinutes != null) timeParts.push(`${recipe.cookMinutes} ${t('recipes.cookShort')}`);

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-5">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 text-left min-h-11 rounded-lg focus-ring"
        >
          <span className="w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
            <ChefHat className="w-5 h-5 text-section-primary" aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-content break-words">{recipe.title}</span>
            <span className="block text-sm text-content-muted">
              {recipe.servings} {t('recipes.servingsLabel')}
              {timeParts.length ? ` · ${timeParts.join(' · ')}` : ''}
            </span>
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-content-muted shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>

        {(onShare || onEdit || onDelete) && (
          <div className="flex gap-1 shrink-0">
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                aria-label={t('recipes.share')}
                className="w-11 h-11 flex items-center justify-center text-content-muted hover:text-content rounded-lg"
              >
                <Share2 className="w-4 h-4" aria-hidden />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={t('clients.common.edit')}
                className="w-11 h-11 flex items-center justify-center text-content-muted hover:text-content rounded-lg"
              >
                <Edit className="w-4 h-4" aria-hidden />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={t('clients.common.delete')}
                className="w-11 h-11 flex items-center justify-center text-red-400 hover:text-red-300 rounded-lg"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <span
          className={cn(
            'px-2.5 py-1 rounded-full text-xs',
            recipe.source === 'ai'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-section-primary/20 text-section-primary',
          )}
        >
          {recipe.source === 'ai' ? t('recipes.aiBadge') : t('recipes.manualBadge')}
        </span>
        {shared && (
          <span className="px-2.5 py-1 rounded-full text-xs bg-success-DEFAULT/20 text-success-DEFAULT inline-flex items-center gap-1">
            <Users className="w-3 h-3" aria-hidden />
            {t('recipes.shared')}
          </span>
        )}
        {(recipe.tags ?? []).map((tag) => (
          <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-surface-input text-content-muted">
            {tag}
          </span>
        ))}
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-hairline space-y-4">
          <div>
            <p className="text-sm font-semibold text-content mb-2">{t('recipes.ingredients')}</p>
            <ul className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={`${ing.item}-${i}`} className="text-sm text-content-muted flex justify-between gap-3">
                  <span>{ing.item}</span>
                  <span className="shrink-0">{ing.quantity}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-content mb-2">{t('recipes.steps')}</p>
            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="text-sm text-content-muted flex gap-2">
                  <span className="text-content-muted w-5 shrink-0 text-right">{i + 1}.</span>
                  <span className="flex-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {hasNutrition && (
            <div>
              <p className="text-sm font-semibold text-content mb-2">{t('recipes.nutrition')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {nutrition.kcal != null && <NutritionValue label={t('recipes.kcal')} value={nutrition.kcal} />}
                {nutrition.protein != null && <NutritionValue label={t('recipes.protein')} value={nutrition.protein} />}
                {nutrition.carbs != null && <NutritionValue label={t('recipes.carbs')} value={nutrition.carbs} />}
                {nutrition.fat != null && <NutritionValue label={t('recipes.fat')} value={nutrition.fat} />}
              </div>
              {/* Legally load-bearing: these are indicative values, not a target. */}
              <p className="text-xs text-content-muted mt-2">{t('recipes.nutritionNote')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NutritionValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-input px-3 py-2">
      <p className="text-xs text-content-muted">{label}</p>
      <p className="text-sm font-medium text-content">{value}</p>
    </div>
  );
}

export default RecipeCard;
