'use client';

/**
 * Client-facing workout plans ("Le mie schede") and progress tracking.
 *
 * A client reaches their plans through the `clients/{clientId}` relationship document,
 * which links their uid to a provider. They may read only **published** plans — a draft is
 * the trainer's working copy and showing it would undermine the review step that exists to
 * keep AI output from reaching anyone unchecked.
 *
 * Spec: docs/superpowers/specs/2026-08-09-workout-plans-design.md
 */

import {
  collection, doc, getDoc, getDocs, query, setDoc, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { Exercise, PlanProgressEntry, TrainingProgram } from '@/types/clientPlans';

/** The client relationship documents that belong to this user. */
async function clientDocIdsFor(userId: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'clients'), where('userId', '==', userId)));
  return snap.docs.map((d) => d.id);
}

/**
 * Published plans for the signed-in client, newest first.
 *
 * Drafts and archived plans are filtered out here AND denied by rules — the rule is the
 * guarantee, this is so the UI never asks for something it will be refused.
 */
export async function getMyWorkoutPlans(userId: string): Promise<Array<TrainingProgram & { clientId: string }>> {
  const clientIds = await clientDocIdsFor(userId);
  const out: Array<TrainingProgram & { clientId: string }> = [];

  for (const clientId of clientIds) {
    const snap = await getDocs(
      query(
        collection(db, 'clients', clientId, 'trainingPrograms'),
        where('status', '==', 'published'),
      ),
    );
    for (const d of snap.docs) {
      out.push({ id: d.id, clientId, ...(d.data() as Omit<TrainingProgram, 'id'>) });
    }
  }

  return out.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

/** The shared exercise library, keyed by id, for resolving names in a plan. */
export async function getExerciseLibrary(): Promise<Record<string, Exercise>> {
  const snap = await getDocs(query(collection(db, 'exercises'), orderBy('primary')));
  const map: Record<string, Exercise> = {};
  for (const d of snap.docs) map[d.id] = { id: d.id, ...(d.data() as Omit<Exercise, 'id'>) };
  return map;
}

/** Deterministic id so re-saving the same day updates rather than duplicating. */
function progressId(planId: string, weekNumber: number, dayLabel: string): string {
  return `${planId}__w${weekNumber}__${dayLabel.replace(/[^\w]+/g, '_').slice(0, 40)}`;
}

export async function getPlanProgress(
  clientId: string,
  planId: string,
): Promise<Record<string, PlanProgressEntry>> {
  const snap = await getDocs(
    query(collection(db, 'clients', clientId, 'planProgress'), where('planId', '==', planId)),
  );
  const map: Record<string, PlanProgressEntry> = {};
  for (const d of snap.docs) {
    map[d.id] = { id: d.id, ...(d.data() as Omit<PlanProgressEntry, 'id'>) };
  }
  return map;
}

export async function saveDayProgress(args: {
  clientId: string;
  planId: string;
  weekNumber: number;
  dayLabel: string;
  exercises: PlanProgressEntry['exercises'];
  rpe?: number;
  notes?: string;
}): Promise<string> {
  const id = progressId(args.planId, args.weekNumber, args.dayLabel);
  const ref = doc(db, 'clients', args.clientId, 'planProgress', id);

  await setDoc(ref, {
    planId: args.planId,
    weekNumber: args.weekNumber,
    dayLabel: args.dayLabel,
    exercises: args.exercises,
    // Firestore rejects undefined, and RPE/notes are genuinely optional.
    ...(typeof args.rpe === 'number' ? { rpe: args.rpe } : {}),
    ...(args.notes ? { notes: args.notes } : {}),
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return id;
}

/** Convenience for the "x of y completed this week" summary. */
export function weekCompletion(
  plan: TrainingProgram,
  progress: Record<string, PlanProgressEntry>,
  weekNumber: number,
): { done: number; total: number } {
  const week = plan.weeks?.find((w) => w.weekNumber === weekNumber);
  const total = week?.days.length ?? 0;
  const done = (week?.days ?? []).filter(
    (d) => progress[progressId(plan.id, weekNumber, d.label)]?.completedAt,
  ).length;
  return { done, total };
}

export async function getClientRelationship(clientId: string) {
  const snap = await getDoc(doc(db, 'clients', clientId));
  return snap.exists() ? snap.data() : null;
}
