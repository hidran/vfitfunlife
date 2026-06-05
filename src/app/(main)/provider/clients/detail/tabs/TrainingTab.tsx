'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  deleteTrainingProgram,
} from '@/lib/firebase/clientPlans';
import type { TrainingProgram } from '@/types/clientPlans';
import TrainingProgramEditor from './editors/TrainingProgramEditor';

export default function TrainingTab({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<TrainingProgram | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPrograms(await listTrainingPrograms(clientId));
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

  const openEdit = (program: TrainingProgram) => {
    setEditing(program);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditing(null);
  };

  const handleSave = async (data: {
    title: string;
    durationWeeks: number;
    daysPerWeek: number;
    weeks: TrainingProgram['weeks'];
  }) => {
    setSaving(true);
    try {
      if (editing) {
        await updateTrainingProgram(clientId, editing.id, data);
      } else {
        await createTrainingProgram(clientId, { ...data, status: 'active' });
      }
      closeEditor();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTrainingProgram(clientId, id);
    await reload();
  };

  if (showEditor) {
    return (
      <TrainingProgramEditor
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
        <h3 className="text-lg font-semibold text-content">{t('clients.training.title.heading')}</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.training.new')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      ) : programs.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('clients.training.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {programs.map((program) => (
            <div key={program.id} className="bg-surface-elevated rounded-xl border border-hairline p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                    <Dumbbell className="w-5 h-5 text-section-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-content">{program.title}</p>
                    <p className="text-sm text-gray-400">
                      {program.durationWeeks} × {program.daysPerWeek} {t('clients.training.daysPerWeek')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(program)}
                    className="p-1.5 text-gray-400 hover:text-content rounded"
                    aria-label={t('clients.common.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(program.id)}
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
                    program.source === 'ai'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-section-primary/20 text-section-primary'
                  )}
                >
                  {program.source === 'ai'
                    ? t('clients.common.aiBadge')
                    : t('clients.common.manualBadge')}
                </span>
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs',
                    program.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  )}
                >
                  {t(`clients.training.status.${program.status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
