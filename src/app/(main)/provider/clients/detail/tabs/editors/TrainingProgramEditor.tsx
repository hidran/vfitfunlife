'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type {
  TrainingProgram,
  TrainingWeek,
  TrainingDay,
  TrainingExercise,
} from '@/types/clientPlans';

const inputClass =
  'w-full bg-surface-input border border-hairline rounded-lg px-3 py-2 text-sm text-content placeholder-gray-500 outline-none focus:border-section-primary';

interface EditorProgram {
  title: string;
  durationWeeks: number;
  daysPerWeek: number;
  weeks: TrainingWeek[];
}

// Working types: `sets` is held as a raw string while editing so required
// integer inputs can be cleared and retyped without snapping back. Converted
// to a number at save time.
type EditExercise = Omit<TrainingExercise, 'sets'> & { sets: string };
type EditDay = Omit<TrainingDay, 'exercises'> & { exercises: EditExercise[] };
type EditWeek = Omit<TrainingWeek, 'days'> & { days: EditDay[] };

function emptyExercise(): EditExercise {
  return { name: '', sets: '3', reps: '10', restSec: undefined, notes: undefined };
}

function emptyDay(index: number): EditDay {
  return { label: `Day ${index + 1}`, focus: undefined, exercises: [emptyExercise()] };
}

function emptyWeek(weekNumber: number): EditWeek {
  return { weekNumber, days: [emptyDay(0)] };
}

function toEditWeeks(weeks: TrainingWeek[]): EditWeek[] {
  return weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({ ...ex, sets: String(ex.sets) })),
    })),
  }));
}

interface TrainingProgramEditorProps {
  initial?: TrainingProgram | null;
  saving?: boolean;
  onSave: (program: EditorProgram) => void;
  onCancel: () => void;
}

export default function TrainingProgramEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: TrainingProgramEditorProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [durationWeeks, setDurationWeeks] = useState<string>(
    initial?.durationWeeks != null ? String(initial.durationWeeks) : '4'
  );
  const [daysPerWeek, setDaysPerWeek] = useState<string>(
    initial?.daysPerWeek != null ? String(initial.daysPerWeek) : '3'
  );
  const [weeks, setWeeks] = useState<EditWeek[]>(
    initial?.weeks?.length ? toEditWeeks(initial.weeks) : [emptyWeek(1)]
  );

  const updateWeeks = (next: EditWeek[]) => setWeeks(next);

  const addWeek = () => {
    setWeeks([...weeks, emptyWeek(weeks.length + 1)]);
  };
  const removeWeek = (wi: number) => {
    setWeeks(weeks.filter((_, i) => i !== wi));
  };
  const addDay = (wi: number) => {
    const next = [...weeks];
    next[wi] = { ...next[wi], days: [...next[wi].days, emptyDay(next[wi].days.length)] };
    updateWeeks(next);
  };
  const removeDay = (wi: number, di: number) => {
    const next = [...weeks];
    next[wi] = { ...next[wi], days: next[wi].days.filter((_, i) => i !== di) };
    updateWeeks(next);
  };
  const addExercise = (wi: number, di: number) => {
    const next = [...weeks];
    const days = [...next[wi].days];
    days[di] = { ...days[di], exercises: [...days[di].exercises, emptyExercise()] };
    next[wi] = { ...next[wi], days };
    updateWeeks(next);
  };
  const removeExercise = (wi: number, di: number, ei: number) => {
    const next = [...weeks];
    const days = [...next[wi].days];
    days[di] = { ...days[di], exercises: days[di].exercises.filter((_, i) => i !== ei) };
    next[wi] = { ...next[wi], days };
    updateWeeks(next);
  };

  const setDayField = (wi: number, di: number, patch: Partial<EditDay>) => {
    const next = [...weeks];
    const days = [...next[wi].days];
    days[di] = { ...days[di], ...patch };
    next[wi] = { ...next[wi], days };
    updateWeeks(next);
  };
  const setExerciseField = (
    wi: number,
    di: number,
    ei: number,
    patch: Partial<EditExercise>
  ) => {
    const next = [...weeks];
    const days = [...next[wi].days];
    const exercises = [...days[di].exercises];
    exercises[ei] = { ...exercises[ei], ...patch };
    days[di] = { ...days[di], exercises };
    next[wi] = { ...next[wi], days };
    updateWeeks(next);
  };

  const durationWeeksNum = parseInt(durationWeeks, 10);
  const daysPerWeekNum = parseInt(daysPerWeek, 10);

  const handleSave = () => {
    const normalizedWeeks: TrainingWeek[] = weeks.map((w, i) => ({
      ...w,
      weekNumber: i + 1,
      days: w.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          const setsNum = parseInt(ex.sets, 10);
          return { ...ex, sets: !isNaN(setsNum) && setsNum >= 1 ? setsNum : 1 };
        }),
      })),
    }));
    onSave({
      title: title.trim(),
      durationWeeks: durationWeeksNum,
      daysPerWeek: daysPerWeekNum,
      weeks: normalizedWeeks,
    });
  };

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <label className="block text-sm text-gray-400 mb-1">{t('clients.training.title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('clients.training.weeks')}</label>
          <input
            type="number"
            min={1}
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('clients.training.daysPerWeek')}</label>
          <input
            type="number"
            min={1}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-5">
        {weeks.map((week, wi) => (
          <div key={wi} className="border border-hairline rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-content">
                {t('clients.training.week')} {wi + 1}
              </h4>
              <button
                onClick={() => removeWeek(wi)}
                className="p-1.5 text-red-400 hover:text-red-300 rounded"
                aria-label={t('clients.common.remove')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {week.days.map((day, di) => (
              <div key={di} className="bg-surface-input/40 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={day.label}
                    onChange={(e) => setDayField(wi, di, { label: e.target.value })}
                    placeholder={t('clients.training.day')}
                    className={cn(inputClass, 'flex-1')}
                  />
                  <input
                    type="text"
                    value={day.focus ?? ''}
                    onChange={(e) => setDayField(wi, di, { focus: e.target.value || undefined })}
                    placeholder={t('clients.training.focus')}
                    className={cn(inputClass, 'flex-1')}
                  />
                  <button
                    onClick={() => removeDay(wi, di)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded shrink-0"
                    aria-label={t('clients.common.remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {day.exercises.map((ex, ei) => (
                    <div
                      key={ei}
                      className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        value={ex.name}
                        onChange={(e) => setExerciseField(wi, di, ei, { name: e.target.value })}
                        placeholder={t('clients.training.exercise')}
                        className={cn(inputClass, 'sm:col-span-4 col-span-2')}
                      />
                      <input
                        type="number"
                        min={1}
                        value={ex.sets}
                        onChange={(e) =>
                          setExerciseField(wi, di, ei, { sets: e.target.value })
                        }
                        placeholder={t('clients.training.sets')}
                        className={cn(inputClass, 'sm:col-span-1')}
                      />
                      <input
                        type="text"
                        value={ex.reps}
                        onChange={(e) => setExerciseField(wi, di, ei, { reps: e.target.value })}
                        placeholder={t('clients.training.reps')}
                        className={cn(inputClass, 'sm:col-span-2')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={ex.restSec ?? ''}
                        onChange={(e) => {
                          if (e.target.value === '') {
                            setExerciseField(wi, di, ei, { restSec: undefined });
                            return;
                          }
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n) && n >= 0) setExerciseField(wi, di, ei, { restSec: n });
                        }}
                        placeholder={t('clients.training.rest')}
                        className={cn(inputClass, 'sm:col-span-2')}
                      />
                      <input
                        type="text"
                        value={ex.notes ?? ''}
                        onChange={(e) =>
                          setExerciseField(wi, di, ei, { notes: e.target.value || undefined })
                        }
                        placeholder={t('clients.training.notes')}
                        className={cn(inputClass, 'sm:col-span-2')}
                      />
                      <button
                        onClick={() => removeExercise(wi, di, ei)}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded justify-self-end sm:col-span-1"
                        aria-label={t('clients.common.remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => addExercise(wi, di)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('clients.common.addExercise')}
                  </Button>
                </div>
              </div>
            ))}

            <Button size="sm" variant="secondary" onClick={() => addDay(wi)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('clients.common.addDay')}
            </Button>
          </div>
        ))}

        <Button size="sm" variant="secondary" onClick={addWeek}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.common.addWeek')}
        </Button>
      </div>

      <div className="flex gap-2 pt-2 border-t border-hairline">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={
            saving ||
            !title.trim() ||
            !(durationWeeksNum >= 1) ||
            !(daysPerWeekNum >= 1) ||
            weeks.some((w) =>
              w.days.some((d) =>
                d.exercises.some((ex) => !(parseInt(ex.sets, 10) >= 1))
              )
            )
          }
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
