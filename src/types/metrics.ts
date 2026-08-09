/**
 * Client-side metrics types. Mirrors functions/src/metrics/types.ts, with Firestore
 * Timestamps already converted to Date by the read layer.
 */

export interface TrainerMetrics {
  name: string;
  accepted: number;
  completed: number;
  paymentConfirmed: number;
  grossValue: number;
  lastAcceptedAt: Date | null;
}

export interface MetricsDaily {
  dateKey: string;

  sessionsRequested: number;
  sessionsAccepted: number;
  sessionsCompleted: number;
  sessionsPaymentConfirmed: number;
  grossValue: number;
  newClients: number;
  lateCancellations: number;
  trainerCancellations: number;

  activeTrainers: number;
  totalTrainers: number;
  cumulativeCompleted: number;
  cumulativePaymentConfirmed: number;
  cumulativeGrossValue: number;
  /** null means "no eligible cohort yet" — distinct from zero. */
  rebookingRate: number | null;
  rebookingCohort: number;
  medianTimeToAcceptHours: number | null;
  disputes: number;
  funnel: {
    registeredClients: number;
    clientsWithRequest: number;
    clientsWithCompleted: number;
  };

  byTrainer: Record<string, TrainerMetrics>;
  /** True when written by the historical backfill rather than the nightly job. */
  backfilled: boolean;
  computedAt: Date | null;
}

export interface PilotGates {
  deadline: Date;
  targetActiveTrainers: number;
  targetCompletedSessions: number;
}

export interface WeeklyPoint {
  weekLabel: string;
  requested: number;
  accepted: number;
  completed: number;
  paid: number;
}

export type GateStatus = 'green' | 'amber' | 'red';

/**
 * Green once both targets are met. Red once the deadline has passed without that. Amber
 * when behind the linear pace needed to arrive on time — the point being to show trouble
 * while there is still time to act, not to confirm failure afterwards.
 */
export function gateStatus(args: {
  activeTrainers: number;
  completedSessions: number;
  gates: PilotGates;
  now: Date;
  /** When the pilot started, for pace. Defaults to 90 days before the deadline. */
  startedAt?: Date;
}): GateStatus {
  const { activeTrainers, completedSessions, gates, now } = args;
  const met =
    activeTrainers >= gates.targetActiveTrainers &&
    completedSessions >= gates.targetCompletedSessions;
  if (met) return 'green';
  if (now >= gates.deadline) return 'red';

  const startedAt = args.startedAt ?? new Date(gates.deadline.getTime() - 90 * 86400000);
  const total = gates.deadline.getTime() - startedAt.getTime();
  const elapsed = Math.max(0, now.getTime() - startedAt.getTime());
  const expected = total > 0 ? elapsed / total : 0;

  const trainerPace = activeTrainers / Math.max(1, gates.targetActiveTrainers);
  const sessionPace = completedSessions / Math.max(1, gates.targetCompletedSessions);

  return Math.min(trainerPace, sessionPace) >= expected ? 'green' : 'amber';
}
