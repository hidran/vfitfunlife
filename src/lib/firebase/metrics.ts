'use client';

/**
 * Reads the nightly `metrics_daily` snapshots and the Gate 1 targets.
 *
 * Deliberately read-only and aggregation-free: everything is computed server-side by
 * `aggregateMetricsDaily`. If a number looks wrong, it is wrong in the Cloud Function, not
 * here — which is the point of keeping this layer dumb.
 */

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './config';
import type { MetricsDaily, PilotGates, WeeklyPoint } from '@/types/metrics';

const METRICS = 'metrics_daily';

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === 'function' ? t.toDate() : null;
}

function normalise(id: string, data: Record<string, unknown>): MetricsDaily {
  const byTrainerRaw = (data.byTrainer ?? {}) as Record<string, Record<string, unknown>>;
  const byTrainer: MetricsDaily['byTrainer'] = {};
  for (const [uid, t] of Object.entries(byTrainerRaw)) {
    byTrainer[uid] = {
      name: String(t.name ?? uid),
      accepted: Number(t.accepted ?? 0),
      completed: Number(t.completed ?? 0),
      paymentConfirmed: Number(t.paymentConfirmed ?? 0),
      grossValue: Number(t.grossValue ?? 0),
      lastAcceptedAt: toDateOrNull(t.lastAcceptedAt),
    };
  }
  return {
    dateKey: String(data.dateKey ?? id),
    sessionsRequested: Number(data.sessionsRequested ?? 0),
    sessionsAccepted: Number(data.sessionsAccepted ?? 0),
    sessionsCompleted: Number(data.sessionsCompleted ?? 0),
    sessionsPaymentConfirmed: Number(data.sessionsPaymentConfirmed ?? 0),
    grossValue: Number(data.grossValue ?? 0),
    newClients: Number(data.newClients ?? 0),
    lateCancellations: Number(data.lateCancellations ?? 0),
    trainerCancellations: Number(data.trainerCancellations ?? 0),
    activeTrainers: Number(data.activeTrainers ?? 0),
    totalTrainers: Number(data.totalTrainers ?? 0),
    cumulativeCompleted: Number(data.cumulativeCompleted ?? 0),
    cumulativePaymentConfirmed: Number(data.cumulativePaymentConfirmed ?? 0),
    cumulativeGrossValue: Number(data.cumulativeGrossValue ?? 0),
    // null is meaningful here — "no cohort yet", not zero — so it must not be coerced.
    rebookingRate: data.rebookingRate === null || data.rebookingRate === undefined
      ? null
      : Number(data.rebookingRate),
    rebookingCohort: Number(data.rebookingCohort ?? 0),
    medianTimeToAcceptHours:
      data.medianTimeToAcceptHours === null || data.medianTimeToAcceptHours === undefined
        ? null
        : Number(data.medianTimeToAcceptHours),
    disputes: Number(data.disputes ?? 0),
    funnel: {
      registeredClients: Number((data.funnel as Record<string, number>)?.registeredClients ?? 0),
      clientsWithRequest: Number((data.funnel as Record<string, number>)?.clientsWithRequest ?? 0),
      clientsWithCompleted: Number((data.funnel as Record<string, number>)?.clientsWithCompleted ?? 0),
    },
    byTrainer,
    backfilled: data.backfilled === true,
    computedAt: toDateOrNull(data.computedAt),
  };
}

/** Most recent snapshots first. `days` bounds the read; the page needs ~12 weeks. */
export async function getRecentMetrics(days = 90): Promise<MetricsDaily[]> {
  const snap = await getDocs(
    query(collection(db, METRICS), orderBy('dateKey', 'desc'), limit(days)),
  );
  return snap.docs.map((d) => normalise(d.id, d.data()));
}

export async function getMetricsSince(fromDateKey: string): Promise<MetricsDaily[]> {
  const snap = await getDocs(
    query(collection(db, METRICS), where('dateKey', '>=', fromDateKey), orderBy('dateKey', 'desc')),
  );
  return snap.docs.map((d) => normalise(d.id, d.data()));
}

export async function getPilotGates(): Promise<PilotGates | null> {
  const snap = await getDoc(doc(db, 'systemSettings', 'pilotGates'));
  if (!snap.exists()) return null;
  const g = snap.data()?.gate1 ?? {};
  return {
    deadline: toDateOrNull(g.deadline) ?? new Date('2026-10-31T23:59:59Z'),
    targetActiveTrainers: Number(g.targetActiveTrainers ?? 20),
    targetCompletedSessions: Number(g.targetCompletedSessions ?? 30),
  };
}

/**
 * Buckets daily snapshots into ISO weeks for the trend chart.
 *
 * Sums the DAILY event counts. Summing the cumulative fields instead would double-count
 * every day, which is the obvious way to get this wrong.
 */
export function toWeeklyPoints(daily: MetricsDaily[], weeks = 12): WeeklyPoint[] {
  const buckets = new Map<string, WeeklyPoint>();

  for (const d of daily) {
    const date = new Date(`${d.dateKey}T12:00:00Z`);
    // Monday-anchored week key.
    const day = (date.getUTCDay() + 6) % 7;
    const monday = new Date(date.getTime() - day * 86400000);
    const key = monday.toISOString().slice(0, 10);

    const b = buckets.get(key) ?? {
      weekLabel: `${monday.getUTCDate()}/${monday.getUTCMonth() + 1}`,
      requested: 0, accepted: 0, completed: 0, paid: 0,
    };
    b.requested += d.sessionsRequested;
    b.accepted += d.sessionsAccepted;
    b.completed += d.sessionsCompleted;
    b.paid += d.sessionsPaymentConfirmed;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([, v]) => v);
}
