/**
 * Nightly metrics aggregation, and the one-shot historical backfill.
 *
 * Replaces `aggregateDailyStats`, whose `dailyStats` output was never read by anything.
 *
 * Spec: docs/superpowers/specs/2026-08-09-metrics-dashboard-design.md §7
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { getUserRoleInfo } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { dateKeyInZone } from "./compute";
import { loadInputs, writeMetricsForDay, TIME_ZONE, METRICS_COLLECTION } from "./store";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Recompute a trailing window, not just yesterday: a session completed late, or a client
 * confirming a payment two days on, changes an earlier day's numbers. Cheap at pilot scale
 * and it keeps history honest.
 */
const RECOMPUTE_DAYS = 7;

function recentDateKeys(from: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= days; i++) {
    keys.push(dateKeyInZone(new Date(from.getTime() - i * 86400000), TIME_ZONE));
  }
  return keys;
}

export const aggregateMetricsDaily = onSchedule(
  { region, schedule: "30 2 * * *", timeZone: TIME_ZONE, timeoutSeconds: 540 },
  async (_event: ScheduledEvent) => {
    const { bookings, users } = await loadInputs();
    const keys = recentDateKeys(new Date(), RECOMPUTE_DAYS);

    for (const dateKey of keys) {
      const m = await writeMetricsForDay({ dateKey, bookings, users, backfilled: false });
      if (m.byTrainerTruncated) {
        // Silently short would misreport who is inactive, which is the table's whole job.
        logger.warn("[metrics] byTrainer truncated — move it to a subcollection", { dateKey });
      }
    }

    logger.info(`[metrics] recomputed ${keys.length} days`, { from: keys.at(-1), to: keys[0] });
  }
);

interface BackfillRequest {
  /** When true (the default), nothing is written — only a summary is returned. */
  dryRun?: boolean;
  /** How far back to go. Defaults to the earliest booking. */
  fromDateKey?: string;
}

export const backfillMetricsDaily = onCall<BackfillRequest>(
  { region, timeoutSeconds: 540 },
  async (request: CallableRequest<BackfillRequest>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const role = await getUserRoleInfo(uid);
    if (role?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin access required");
    }

    const dryRun = request.data?.dryRun !== false;
    const { bookings, users } = await loadInputs();

    // Earliest event across all bookings, so the backfill covers real history rather than
    // an arbitrary window.
    let earliest: Date | null = null;
    for (const b of bookings) {
      for (const h of b.statusHistory) {
        if (!earliest || h.at < earliest) earliest = h.at;
      }
    }
    if (!earliest) {
      return { dryRun, days: 0, note: "no booking history to backfill" };
    }

    const startKey = request.data?.fromDateKey ?? dateKeyInZone(earliest, TIME_ZONE);
    const todayKey = dateKeyInZone(new Date(), TIME_ZONE);

    const keys: string[] = [];
    for (let d = new Date(`${startKey}T12:00:00Z`); ; d = new Date(d.getTime() + 86400000)) {
      const key = dateKeyInZone(d, TIME_ZONE);
      keys.push(key);
      if (key >= todayKey || keys.length > 1000) break;
    }

    let written = 0;
    let nonEmpty = 0;
    for (const dateKey of keys) {
      const m = await writeMetricsForDay({ dateKey, bookings, users, backfilled: true, dryRun });
      written++;
      if (m.sessionsRequested || m.sessionsAccepted || m.sessionsCompleted || m.sessionsPaymentConfirmed) {
        nonEmpty++;
      }
    }

    const result = { dryRun, from: keys[0], to: keys.at(-1), days: written, daysWithActivity: nonEmpty };
    logger.info("[metrics] backfill complete", result);

    if (!dryRun) {
      const caller = (await db.collection("users").doc(uid).get()).data();
      await writeAuditLog({
        actorUid: uid, actorEmail: caller?.email ?? "", actorRole: "superadmin",
        action: "create", entityType: "booking", entityId: METRICS_COLLECTION,
        after: result, reason: "metrics_daily backfill (P0-2)",
      });
    }

    return result;
  }
);
