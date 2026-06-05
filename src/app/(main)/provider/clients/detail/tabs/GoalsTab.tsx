'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { listGoals, createGoal, updateGoal, deleteGoal } from '@/lib/firebase/clientPlans';
import type { ClientGoal, GoalType, GoalStatus } from '@/types/clientPlans';

const GOAL_TYPES: GoalType[] = ['weight_loss', 'muscle_gain', 'endurance', 'mobility', 'nutrition', 'other'];
const GOAL_STATUSES: GoalStatus[] = ['active', 'achieved', 'paused'];

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: 'bg-blue-500/20 text-blue-400',
  achieved: 'bg-green-500/20 text-green-400',
  paused: 'bg-yellow-500/20 text-yellow-400',
};

interface GoalFormState {
  type: GoalType;
  description: string;
  targetValue: string;
  unit: string;
  targetDate: string;
  status: GoalStatus;
}

const emptyForm: GoalFormState = {
  type: 'weight_loss',
  description: '',
  targetValue: '',
  unit: '',
  targetDate: '',
  status: 'active',
};

const inputClass =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';

export default function GoalsTab({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GoalFormState>(emptyForm);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await listGoals(clientId));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (goal: ClientGoal) => {
    setForm({
      type: goal.type,
      description: goal.description,
      targetValue: goal.targetValue != null ? String(goal.targetValue) : '',
      unit: goal.unit ?? '',
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : '',
      status: goal.status,
    });
    setEditingId(goal.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        description: form.description.trim(),
        targetValue: form.targetValue.trim() !== '' ? Number(form.targetValue) : undefined,
        unit: form.unit.trim() || undefined,
        targetDate: form.targetDate ? form.targetDate : null,
        status: form.status,
      };
      if (editingId) {
        await updateGoal(clientId, editingId, payload);
      } else {
        await createGoal(clientId, payload);
      }
      closeForm();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await deleteGoal(clientId, id);
      await reload();
    } catch (e) {
      console.error('[GoalsTab] delete failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-content">{t('clients.goals.title')}</h3>
        {!showForm && (
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            {t('clients.goals.new')}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-surface-elevated rounded-xl border border-hairline p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.type')}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as GoalType })}
                className={inputClass}
              >
                {GOAL_TYPES.map((gt) => (
                  <option key={gt} value={gt}>
                    {t(`clients.goals.type.${gt}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.status')}</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as GoalStatus })}
                className={inputClass}
              >
                {GOAL_STATUSES.map((gs) => (
                  <option key={gs} value={gs}>
                    {t(`clients.goals.status.${gs}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={cn(inputClass, 'min-h-[80px]')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.target')}</label>
              <input
                type="number"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.unit')}</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('clients.goals.date')}</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !form.description.trim()}>
              <Save className="w-4 h-4 mr-2" />
              {t('clients.common.save')}
            </Button>
            <Button size="sm" variant="secondary" onClick={closeForm} disabled={saving}>
              <X className="w-4 h-4 mr-2" />
              {t('clients.common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : goals.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('clients.goals.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.map((goal) => (
            <div key={goal.id} className="bg-surface-elevated rounded-xl border border-hairline p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs bg-section-primary/20 text-section-primary">
                    {t(`clients.goals.type.${goal.type}`)}
                  </span>
                  <span className={cn('px-2.5 py-1 rounded-full text-xs', STATUS_COLORS[goal.status])}>
                    {t(`clients.goals.status.${goal.status}`)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(goal)}
                    className="p-1.5 text-gray-400 hover:text-content rounded"
                    aria-label={t('clients.common.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    disabled={saving}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded disabled:opacity-50"
                    aria-label={t('clients.common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-content mt-3">{goal.description}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-400">
                {goal.targetValue != null && (
                  <span>
                    {t('clients.goals.target')}: {goal.targetValue}
                    {goal.unit ? ` ${goal.unit}` : ''}
                  </span>
                )}
                {goal.targetDate && (
                  <span>
                    {t('clients.goals.date')}: {goal.targetDate.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
