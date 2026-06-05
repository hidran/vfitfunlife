'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type {
  DietPlan,
  DietDay,
  DietMeal,
  DietItem,
  MacroTargets,
} from '@/types/clientPlans';

const inputClass =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';

interface EditorPlan {
  title: string;
  durationDays: number;
  targets?: MacroTargets;
  days: DietDay[];
}

function emptyItem(): DietItem {
  return {
    food: '',
    quantity: '',
    kcal: undefined,
    protein: undefined,
    carbs: undefined,
    fat: undefined,
  };
}

function emptyMeal(): DietMeal {
  return { name: '', time: undefined, items: [emptyItem()] };
}

function emptyDay(index: number): DietDay {
  return { label: `Day ${index + 1}`, meals: [emptyMeal()] };
}

interface DietPlanEditorProps {
  initial?: DietPlan | null;
  saving?: boolean;
  onSave: (plan: EditorPlan) => void;
  onCancel: () => void;
}

export default function DietPlanEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: DietPlanEditorProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [durationDays, setDurationDays] = useState<number>(initial?.durationDays ?? 7);
  const [kcal, setKcal] = useState<string>(
    initial?.targets?.kcal != null ? String(initial.targets.kcal) : ''
  );
  const [protein, setProtein] = useState<string>(
    initial?.targets?.protein != null ? String(initial.targets.protein) : ''
  );
  const [carbs, setCarbs] = useState<string>(
    initial?.targets?.carbs != null ? String(initial.targets.carbs) : ''
  );
  const [fat, setFat] = useState<string>(
    initial?.targets?.fat != null ? String(initial.targets.fat) : ''
  );
  const [days, setDays] = useState<DietDay[]>(
    initial?.days?.length ? initial.days : [emptyDay(0)]
  );

  const addDay = () => setDays([...days, emptyDay(days.length)]);
  const removeDay = (di: number) => setDays(days.filter((_, i) => i !== di));

  const setDayField = (di: number, patch: Partial<DietDay>) => {
    const next = [...days];
    next[di] = { ...next[di], ...patch };
    setDays(next);
  };

  const addMeal = (di: number) => {
    const next = [...days];
    next[di] = { ...next[di], meals: [...next[di].meals, emptyMeal()] };
    setDays(next);
  };
  const removeMeal = (di: number, mi: number) => {
    const next = [...days];
    next[di] = { ...next[di], meals: next[di].meals.filter((_, i) => i !== mi) };
    setDays(next);
  };
  const setMealField = (di: number, mi: number, patch: Partial<DietMeal>) => {
    const next = [...days];
    const meals = [...next[di].meals];
    meals[mi] = { ...meals[mi], ...patch };
    next[di] = { ...next[di], meals };
    setDays(next);
  };

  const addItem = (di: number, mi: number) => {
    const next = [...days];
    const meals = [...next[di].meals];
    meals[mi] = { ...meals[mi], items: [...meals[mi].items, emptyItem()] };
    next[di] = { ...next[di], meals };
    setDays(next);
  };
  const removeItem = (di: number, mi: number, ii: number) => {
    const next = [...days];
    const meals = [...next[di].meals];
    meals[mi] = { ...meals[mi], items: meals[mi].items.filter((_, i) => i !== ii) };
    next[di] = { ...next[di], meals };
    setDays(next);
  };
  const setItemField = (di: number, mi: number, ii: number, patch: Partial<DietItem>) => {
    const next = [...days];
    const meals = [...next[di].meals];
    const items = [...meals[mi].items];
    items[ii] = { ...items[ii], ...patch };
    meals[mi] = { ...meals[mi], items };
    next[di] = { ...next[di], meals };
    setDays(next);
  };

  const parseOptionalNumber = (
    value: string,
    onSet: (n: number | undefined) => void
  ) => {
    if (value === '') {
      onSet(undefined);
      return;
    }
    const n = Number(value);
    if (!isNaN(n) && n >= 0) onSet(n);
  };

  const handleSave = () => {
    const targets: MacroTargets = {
      kcal: kcal.trim() !== '' ? Number(kcal) : undefined,
      protein: protein.trim() !== '' ? Number(protein) : undefined,
      carbs: carbs.trim() !== '' ? Number(carbs) : undefined,
      fat: fat.trim() !== '' ? Number(fat) : undefined,
    };
    const hasTargets =
      targets.kcal != null ||
      targets.protein != null ||
      targets.carbs != null ||
      targets.fat != null;
    onSave({
      title: title.trim(),
      durationDays,
      targets: hasTargets ? targets : undefined,
      days,
    });
  };

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('clients.diet.title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('clients.diet.durationDays')}</label>
          <input
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 1) setDurationDays(n);
            }}
            className={inputClass}
          />
        </div>
      </div>

      {/* Macro targets */}
      <div>
        <p className="text-sm font-semibold text-content mb-2">{t('clients.diet.targets')}</p>
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

      {/* Days */}
      <div className="space-y-5">
        {days.map((day, di) => (
          <div key={di} className="border border-hairline rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={day.label}
                onChange={(e) => setDayField(di, { label: e.target.value })}
                placeholder={t('clients.diet.day')}
                className={cn(inputClass, 'flex-1')}
              />
              <button
                onClick={() => removeDay(di)}
                className="p-1.5 text-red-400 hover:text-red-300 rounded shrink-0"
                aria-label={t('clients.common.remove')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {day.meals.map((meal, mi) => (
              <div key={mi} className="bg-surface-input/40 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={meal.name}
                    onChange={(e) => setMealField(di, mi, { name: e.target.value })}
                    placeholder={t('clients.diet.meal')}
                    className={cn(inputClass, 'flex-1')}
                  />
                  <input
                    type="time"
                    value={meal.time ?? ''}
                    onChange={(e) => setMealField(di, mi, { time: e.target.value || undefined })}
                    className={cn(inputClass, 'w-32')}
                  />
                  <button
                    onClick={() => removeMeal(di, mi)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded shrink-0"
                    aria-label={t('clients.common.remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {meal.items.map((item, ii) => (
                    <div key={ii} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.food}
                        onChange={(e) => setItemField(di, mi, ii, { food: e.target.value })}
                        placeholder={t('clients.diet.food')}
                        className={cn(inputClass, 'col-span-2 sm:col-span-3')}
                      />
                      <input
                        type="text"
                        value={item.quantity}
                        onChange={(e) => setItemField(di, mi, ii, { quantity: e.target.value })}
                        placeholder={t('clients.diet.quantity')}
                        className={cn(inputClass, 'sm:col-span-2')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.kcal ?? ''}
                        onChange={(e) =>
                          parseOptionalNumber(e.target.value, (n) =>
                            setItemField(di, mi, ii, { kcal: n })
                          )
                        }
                        placeholder={t('clients.diet.kcal')}
                        className={cn(inputClass, 'sm:col-span-2')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.protein ?? ''}
                        onChange={(e) =>
                          parseOptionalNumber(e.target.value, (n) =>
                            setItemField(di, mi, ii, { protein: n })
                          )
                        }
                        placeholder={t('clients.diet.protein')}
                        className={cn(inputClass, 'sm:col-span-1')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.carbs ?? ''}
                        onChange={(e) =>
                          parseOptionalNumber(e.target.value, (n) =>
                            setItemField(di, mi, ii, { carbs: n })
                          )
                        }
                        placeholder={t('clients.diet.carbs')}
                        className={cn(inputClass, 'sm:col-span-1')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.fat ?? ''}
                        onChange={(e) =>
                          parseOptionalNumber(e.target.value, (n) =>
                            setItemField(di, mi, ii, { fat: n })
                          )
                        }
                        placeholder={t('clients.diet.fat')}
                        className={cn(inputClass, 'sm:col-span-1')}
                      />
                      <button
                        onClick={() => removeItem(di, mi, ii)}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded justify-self-end sm:col-span-2"
                        aria-label={t('clients.common.remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="secondary" onClick={() => addItem(di, mi)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('clients.common.addItem')}
                  </Button>
                </div>
              </div>
            ))}

            <Button size="sm" variant="secondary" onClick={() => addMeal(di)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('clients.common.addMeal')}
            </Button>
          </div>
        ))}

        <Button size="sm" variant="secondary" onClick={addDay}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.common.addDay')}
        </Button>
      </div>

      <div className="flex gap-2 pt-2 border-t border-hairline">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !title.trim() || durationDays < 1}
        >
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
