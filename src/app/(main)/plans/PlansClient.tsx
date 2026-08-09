'use client';

/**
 * "Le mie schede" — the client's view of the workout plans their trainer published.
 *
 * Only published plans are fetched, and rules deny drafts regardless. Progress is written
 * by the client (their record of what they actually did), which is why this is one of the
 * few places in the app where the client is the author rather than a Cloud Function.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Dumbbell, Info, Sparkles } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import {
  getExerciseLibrary, getMyWorkoutPlans, getPlanProgress, saveDayProgress, weekCompletion,
} from '@/lib/firebase/workoutPlans';
import type { Exercise, PlanProgressEntry, TrainingProgram } from '@/types/clientPlans';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';

type Plan = TrainingProgram & { clientId: string };

function progressKey(planId: string, week: number, day: string) {
  return `${planId}__w${week}__${day.replace(/[^\w]+/g, '_').slice(0, 40)}`;
}

export default function PlansClient() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [library, setLibrary] = useState<Record<string, Exercise>>({});
  const [progress, setProgress] = useState<Record<string, PlanProgressEntry>>({});
  const [openWeek, setOpenWeek] = useState(1);
  const [savingDay, setSavingDay] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      const [p, lib] = await Promise.all([getMyWorkoutPlans(user.uid), getExerciseLibrary()]);
      if (cancelled) return;
      setPlans(p);
      setLibrary(lib);
      if (p[0]) setProgress(await getPlanProgress(p[0].clientId, p[0].id));
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const plan = plans?.[0] ?? null;

  const toggleExercise = useCallback(
    async (week: number, dayLabel: string, index: number, exerciseCount: number) => {
      if (!plan) return;
      const key = progressKey(plan.id, week, dayLabel);
      const current = progress[key];
      const exercises = { ...(current?.exercises ?? {}) };
      exercises[String(index)] = { ...exercises[String(index)], done: !exercises[String(index)]?.done };

      // Optimistic: ticking a set should feel instant mid-workout, not wait on a round trip.
      setProgress((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? { id: key, planId: plan.id, weekNumber: week, dayLabel, exercises: {} }), exercises },
      }));

      setSavingDay(key);
      try {
        await saveDayProgress({
          clientId: plan.clientId, planId: plan.id, weekNumber: week, dayLabel, exercises,
        });
      } finally {
        setSavingDay(null);
      }
      void exerciseCount;
    },
    [plan, progress],
  );

  if (!plans) {
    return <div className="flex justify-center py-20"><Spinner size="md" /></div>;
  }

  if (!plan) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-content mb-2">{t('plans.title' as MessageKey)}</h1>
        <div className="rounded-2xl border border-hairline bg-surface-elevated p-6 text-center">
          <Dumbbell className="w-8 h-8 mx-auto text-content-muted" aria-hidden />
          <p className="mt-3 text-sm text-content-muted">{t('plans.empty' as MessageKey)}</p>
        </div>
      </div>
    );
  }

  const week = plan.weeks?.find((w) => w.weekNumber === openWeek) ?? plan.weeks?.[0];
  const completion = weekCompletion(plan, progress, week?.weekNumber ?? 1);

  return (
    <div className="p-4 sm:p-6 space-y-5 pb-28">
      <header>
        <h1 className="text-2xl font-bold text-content">{plan.title}</h1>
        <p className="text-sm text-content-muted">{t('plans.subtitle' as MessageKey)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {plan.generatedByAi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--section-primary)]/10 px-3 py-1 text-xs text-[var(--section-primary)]">
              <Sparkles className="w-3 h-3" aria-hidden />
              {t('plans.aiBadge' as MessageKey)}
            </span>
          )}
        </div>
      </header>

      {/* Shown whenever the client flagged an injury. Deliberately prominent: a trainer
          cannot give medical advice, and this is the line that says so. */}
      {plan.medicalClearanceNote && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex gap-3">
          <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold text-content text-sm">{t('plans.medicalNote' as MessageKey)}</p>
            <p className="text-sm text-content-muted mt-1">{plan.medicalClearanceNote}</p>
          </div>
        </div>
      )}

      {(plan.weeks?.length ?? 0) > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
          {plan.weeks.map((w) => (
            <button
              key={w.weekNumber}
              role="tab"
              aria-selected={w.weekNumber === week?.weekNumber}
              onClick={() => setOpenWeek(w.weekNumber)}
              className={cn(
                'min-h-11 whitespace-nowrap rounded-lg px-4 text-sm font-medium',
                w.weekNumber === week?.weekNumber
                  ? 'bg-[var(--section-primary)] text-white'
                  : 'bg-surface-elevated text-content-muted',
              )}
            >
              {t('plans.week' as MessageKey, { n: String(w.weekNumber) })}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-content-muted">
        {t('plans.progressWeek' as MessageKey, {
          done: String(completion.done), total: String(completion.total),
        })}
      </p>

      <div className="space-y-4">
        {week?.days.map((day) => {
          const key = progressKey(plan.id, week.weekNumber, day.label);
          const dayProgress = progress[key];
          return (
            <section key={day.label} className="rounded-2xl border border-hairline bg-surface-elevated p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-content">{day.label}</h2>
                  {day.focus && <p className="text-xs text-content-muted">{day.focus}</p>}
                </div>
                {savingDay === key && <Spinner size="sm" />}
              </div>

              <ul className="space-y-2">
                {day.exercises.map((entry, i) => {
                  const lib = entry.exerciseId ? library[entry.exerciseId] : undefined;
                  // Legacy free-text plans have `name` and no exerciseId; both must render.
                  const label = lib?.name.it ?? entry.name ?? entry.exerciseId ?? '—';
                  const done = dayProgress?.exercises?.[String(i)]?.done ?? false;
                  return (
                    <li key={`${entry.exerciseId ?? entry.name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => toggleExercise(week.weekNumber, day.label, i, day.exercises.length)}
                        aria-pressed={done}
                        className="w-full min-h-12 flex items-start gap-3 rounded-lg p-2 text-left hover:bg-surface"
                      >
                        {done
                          ? <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden />
                          : <Circle className="w-5 h-5 text-content-muted shrink-0 mt-0.5" aria-hidden />}
                        <span className="flex-1">
                          <span className={cn('block text-sm font-medium', done ? 'text-content-muted line-through' : 'text-content')}>
                            {label}
                          </span>
                          <span className="block text-xs text-content-muted">
                            {entry.sets} {t('plans.sets' as MessageKey)} × {entry.reps} {t('plans.reps' as MessageKey)}
                            {entry.restSec ? ` · ${entry.restSec}s ${t('plans.rest' as MessageKey)}` : ''}
                          </span>
                          {entry.notes && (
                            <span className="block text-xs text-content-muted italic mt-0.5">{entry.notes}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <DayFeedback
                planId={plan.id}
                clientId={plan.clientId}
                weekNumber={week.weekNumber}
                dayLabel={day.label}
                existing={dayProgress}
                onSaved={(entry) => setProgress((p) => ({ ...p, [key]: entry }))}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DayFeedback(props: {
  planId: string;
  clientId: string;
  weekNumber: number;
  dayLabel: string;
  existing?: PlanProgressEntry;
  onSaved: (entry: PlanProgressEntry) => void;
}) {
  const { t } = useI18n();
  const [rpe, setRpe] = useState<string>(props.existing?.rpe ? String(props.existing.rpe) : '');
  const [notes, setNotes] = useState(props.existing?.notes ?? '');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveDayProgress({
        clientId: props.clientId,
        planId: props.planId,
        weekNumber: props.weekNumber,
        dayLabel: props.dayLabel,
        exercises: props.existing?.exercises ?? {},
        rpe: rpe ? Number(rpe) : undefined,
        notes: notes.trim() || undefined,
      });
      props.onSaved({
        ...(props.existing ?? {
          id: '', planId: props.planId, weekNumber: props.weekNumber,
          dayLabel: props.dayLabel, exercises: {},
        }),
        rpe: rpe ? Number(rpe) : undefined,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-hairline space-y-3">
      <div className="flex items-center gap-3">
        <label htmlFor={`rpe-${props.dayLabel}`} className="text-xs text-content-muted flex-1">
          {t('plans.rpe' as MessageKey)}
        </label>
        <input
          id={`rpe-${props.dayLabel}`}
          type="number" min={1} max={10} inputMode="numeric"
          value={rpe} onChange={(e) => setRpe(e.target.value)}
          className="w-20 min-h-11 rounded-lg border border-hairline bg-surface px-2 text-center text-content"
        />
      </div>
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder={t('plans.sessionNotes' as MessageKey)}
        rows={2}
        className="w-full rounded-lg border border-hairline bg-surface p-2 text-sm text-content"
      />
      <Button variant="secondary" onClick={save} disabled={busy} className="w-full min-h-11">
        {saved ? t('plans.saved' as MessageKey) : t('plans.saveProgress' as MessageKey)}
      </Button>
    </div>
  );
}
