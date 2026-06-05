'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Salad, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listDietPlans,
  createDietPlan,
  updateDietPlan,
  deleteDietPlan,
  aiGenerateDiet,
} from '@/lib/firebase/clientPlans';
import type { DietPlan, DietParams } from '@/types/clientPlans';
import DietPlanEditor from './editors/DietPlanEditor';
import { aiGenerateErrorMessage } from './aiGenerateError';

const aiInput =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';
const aiLabel = 'block text-xs font-medium text-content-muted mb-1';

function macroSummary(plan: DietPlan): string {
  const tt = plan.targets;
  if (!tt) return '';
  const parts: string[] = [];
  if (tt.kcal != null) parts.push(`${tt.kcal} kcal`);
  if (tt.protein != null) parts.push(`${tt.protein}P`);
  if (tt.carbs != null) parts.push(`${tt.carbs}C`);
  if (tt.fat != null) parts.push(`${tt.fat}F`);
  return parts.join(' · ');
}

export default function DietTab({ clientId }: { clientId: string }) {
  const { t, locale } = useI18n();
  const [plans, setPlans] = useState<DietPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<DietPlan | null>(null);

  // AI generation params form
  const [showAi, setShowAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState('7');
  const [kcalTarget, setKcalTarget] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState('3');
  const [restrictions, setRestrictions] = useState('');
  const [notes, setNotes] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setAiError(null);
    try {
      const params: DietParams = {
        durationDays: parseInt(durationDays, 10) || 7,
        mealsPerDay: parseInt(mealsPerDay, 10) || 3,
        ...(kcalTarget.trim() && !Number.isNaN(parseInt(kcalTarget, 10))
          ? { kcalTarget: parseInt(kcalTarget, 10) }
          : {}),
        ...(restrictions.trim() ? { restrictions: restrictions.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const created = await aiGenerateDiet(clientId, params, locale);
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
      setPlans(await listDietPlans(clientId));
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

  const openEdit = (plan: DietPlan) => {
    setEditing(plan);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
  };

  const handleSave = async (data: {
    title: string;
    durationDays: number;
    targets?: DietPlan['targets'];
    days: DietPlan['days'];
  }) => {
    setSaving(true);
    try {
      if (editing) {
        await updateDietPlan(clientId, editing.id, data);
      } else {
        await createDietPlan(clientId, { ...data, status: 'active' });
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
      await deleteDietPlan(clientId, id);
      await reload();
    } catch (e) {
      console.error('[DietTab] delete failed', e);
    } finally {
      setSaving(false);
    }
  };

  if (showEditor) {
    return (
      <DietPlanEditor
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
        <h3 className="text-lg font-semibold text-content">{t('clients.diet.heading')}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAiError(null); setShowAi(true); }}>
            <Sparkles className="w-4 h-4 mr-2" />
            {t('clients.aiGenerate.button')}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            {t('clients.diet.new')}
          </Button>
        </div>
      </div>

      {showAi && (
        <Modal onClose={() => (generating ? undefined : setShowAi(false))} className="w-full max-w-md">
          <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-content flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-section-primary" />
                {t('clients.aiGenerate.diet.title')}
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
                <label className={aiLabel}>{t('clients.aiGenerate.diet.durationDays')}</label>
                <input className={aiInput} type="number" min={1} max={30} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.diet.mealsPerDay')}</label>
                <input className={aiInput} type="number" min={2} max={6} value={mealsPerDay} onChange={(e) => setMealsPerDay(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={aiLabel}>{t('clients.aiGenerate.diet.kcalTarget')}</label>
                <input className={aiInput} type="number" min={800} max={6000} value={kcalTarget} onChange={(e) => setKcalTarget(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.diet.restrictions')}</label>
              <input className={aiInput} value={restrictions} onChange={(e) => setRestrictions(e.target.value)} />
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.diet.notes')}</label>
              <textarea className={aiInput} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
      ) : plans.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('clients.diet.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const summary = macroSummary(plan);
            return (
              <div key={plan.id} className="bg-surface-elevated rounded-xl border border-hairline p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                      <Salad className="w-5 h-5 text-section-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-content">{plan.title}</p>
                      <p className="text-sm text-gray-400">
                        {plan.durationDays} {t('clients.diet.daysLabel')}
                        {summary ? ` · ${summary}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-1.5 text-gray-400 hover:text-content rounded"
                      aria-label={t('clients.common.edit')}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
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
                      plan.source === 'ai'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-section-primary/20 text-section-primary'
                    )}
                  >
                    {plan.source === 'ai'
                      ? t('clients.common.aiBadge')
                      : t('clients.common.manualBadge')}
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs',
                      plan.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    )}
                  >
                    {t(`clients.diet.status.${plan.status}`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
