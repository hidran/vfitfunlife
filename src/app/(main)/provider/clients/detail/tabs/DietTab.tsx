'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Salad } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listDietPlans,
  createDietPlan,
  updateDietPlan,
  deleteDietPlan,
} from '@/lib/firebase/clientPlans';
import type { DietPlan } from '@/types/clientPlans';
import DietPlanEditor from './editors/DietPlanEditor';

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
  const { t } = useI18n();
  const [plans, setPlans] = useState<DietPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<DietPlan | null>(null);

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
    await deleteDietPlan(clientId, id);
    await reload();
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
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.diet.new')}
        </Button>
      </div>

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
                      className="p-1.5 text-red-400 hover:text-red-300 rounded"
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
