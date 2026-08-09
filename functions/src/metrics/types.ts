/**
 * Metrics types, shared between the nightly job, the backfill and the pure compute layer.
 *
 * Spec: docs/superpowers/specs/2026-08-09-metrics-dashboard-design.md §6
 */

import type { BookingStatus, StatusActorRole } from "../bookings/types";

/** The minimum shape `computeMetricsForDay` needs. Deliberately plain — no Firestore types,
 *  so the compute layer stays unit-testable without an emulator. */
export interface MetricsBooking {
  id: string;
  userId: string;
  instructorId?: string | null;
  instructorName?: string | null;
  status: BookingStatus;
  statusHistory: Array<{
    status: BookingStatus;
    actorUid: string;
    actorRole: StatusActorRole;
    at: Date;
  }>;
  finalPrice?: number;
  lateCancellation?: boolean;
  paymentConfirmation?: {
    amount: number;
    clientResponse: "confirmed" | "disputed" | null;
    /** Anchors the dispute count to a day, so historical snapshots stay stable. */
    clientRespondedAt?: Date | null;
  } | null;
}

export interface MetricsUser {
  uid: string;
  role: string;
  createdAt: Date | null;
  fullName?: string;
  /** Soft-deleted or seeded demo accounts, excluded from trainer/client counts. */
  hidden?: boolean;
}

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

  // Daily events
  sessionsRequested: number;
  sessionsAccepted: number;
  sessionsCompleted: number;
  sessionsPaymentConfirmed: number;
  grossValue: number;
  newClients: number;
  lateCancellations: number;
  trainerCancellations: number;

  // Rolling / cumulative as of this date
  activeTrainers: number;
  totalTrainers: number;
  cumulativeCompleted: number;
  cumulativePaymentConfirmed: number;
  cumulativeGrossValue: number;
  rebookingRate: number | null;
  /** The denominator. A rate without it cannot be defended in a partners' meeting, and it
   *  distinguishes "no eligible cohort" from "a cohort of four". */
  rebookingCohort: number;
  medianTimeToAcceptHours: number | null;
  disputes: number;
  funnel: {
    registeredClients: number;
    clientsWithRequest: number;
    clientsWithCompleted: number;
  };

  byTrainer: Record<string, TrainerMetrics>;
  byTrainerTruncated: boolean;
}

/** Past this the pilot has outgrown a map and byTrainer should become a subcollection. */
export const MAX_TRAINERS_IN_MAP = 200;

/** Below this many eligible clients a rebooking rate is noise, so we report null. */
export const MIN_REBOOKING_COHORT = 5;

export const REBOOKING_WINDOW_DAYS = 30;
export const ACTIVE_TRAINER_WINDOW_DAYS = 30;
