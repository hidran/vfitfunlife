'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Dumbbell, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import {
  listTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  deleteTrainingProgram,
  aiGenerateTraining,
} from '@/lib/firebase/clientPlans';
import type { TrainingProgram, TrainingParams } from '@/types/clientPlans';
import TrainingProgramEditor from './editors/TrainingProgramEditor';
import { aiGenerateErrorMessage } from './aiGenerateError';

const aiInput =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';
const aiLabel = 'block text-xs font-medium text-content-muted mb-1';

export default function TrainingTab({ clientId }: { clientId: string }) {
  const { t, locale } = useI18n();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<TrainingProgram | null>(null);

  // AI generation params form
  const [showAi, setShowAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [focus, setFocus] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('4');
  const [daysPerWeek, setDaysPerWeek] = useState('3');
  const [sessionMinutes, setSessionMinutes] = useState('60');
  const [level, setLevel] = useState<TrainingParams['level']>('beginner');
  const [equipment, setEquipment] = useState('');
  const [constraints, setConstraints] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setAiError(null);
    try {
      const params: TrainingParams = {
        durationWeeks: parseInt(durationWeeks, 10) || 4,
        daysPerWeek: parseInt(daysPerWeek, 10) || 3,
        ...(focus.trim() ? { focus: focus.trim() } : {}),
        ...(sessionMinutes.trim() && !Number.isNaN(parseInt(sessionMinutes, 10))
          ? { sessionMinutes: parseInt(sessionMinutes, 10) }
          : {}),
        ...(level ? { level } : {}),
        ...(equipment.trim() ? { equipment: equipment.trim() } : {}),
        ...(constraints.trim() ? { constraints: constraints.trim() } : {}),
      };
      const created = await aiGenerateTraining(clientId, params, locale);
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
    if (saving) return;
    setSaving(true);
    try {
      await deleteTrainingProgram(clientId, id);
      await reload();
    } catch (e) {
      console.error('[TrainingTab] delete failed', e);
    } finally {
      setSaving(false);
    }
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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setAiError(null); setShowAi(true); }}>
            <Sparkles className="w-4 h-4 mr-2" />
            {t('clients.aiGenerate.button')}
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            {t('clients.training.new')}
          </Button>
        </div>
      </div>

      {showAi && (
        <Modal onClose={() => (generating ? undefined : setShowAi(false))} className="w-full max-w-md">
          <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-content flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-section-primary" />
                {t('clients.aiGenerate.training.title')}
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

            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.training.focus')}</label>
              <input className={aiInput} value={focus} onChange={(e) => setFocus(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.training.durationWeeks')}</label>
                <input className={aiInput} type="number" min={1} max={16} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.training.daysPerWeek')}</label>
                <input className={aiInput} type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.training.sessionMinutes')}</label>
                <input className={aiInput} type="number" min={15} max={180} value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} />
              </div>
              <div>
                <label className={aiLabel}>{t('clients.aiGenerate.training.level')}</label>
                <select className={aiInput} value={level} onChange={(e) => setLevel(e.target.value as TrainingParams['level'])}>
                  <option value="beginner">{t('clients.aiGenerate.training.level.beginner')}</option>
                  <option value="intermediate">{t('clients.aiGenerate.training.level.intermediate')}</option>
                  <option value="advanced">{t('clients.aiGenerate.training.level.advanced')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.training.equipment')}</label>
              <input className={aiInput} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
            </div>
            <div>
              <label className={aiLabel}>{t('clients.aiGenerate.training.constraints')}</label>
              <textarea className={aiInput} rows={2} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
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
