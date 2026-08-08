/**
 * One-shot backfill from the legacy booking status vocabulary to the pilot machine.
 *
 * Superadmin-gated, batched, idempotent and audit-logged. Supports a dry run so the
 * counts can be reviewed before anything is written to production.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §7.3
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { getUserRoleInfo } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { mapLegacyStatus, isAlreadyMigrated } from "./migrateMapping";
import type { LegacyBookingStatus, LegacyCancelledBy } from "./types";

export { mapLegacyStatus, isAlreadyMigrated };

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";
const BATCH_SIZE = 400;

interface MigrateRequest {
  /** When true (the default), nothing is written — only counts are returned. */
  dryRun?: boolean;
}

export const migrateBookingStatuses = onCall<MigrateRequest>(
  { region, timeoutSeconds: 540 },
  async (request: CallableRequest<MigrateRequest>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");

    const uid = request.auth.uid;
    const role = await getUserRoleInfo(uid);
    if (role?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin access required");
    }

    // Defaults to a dry run: a destructive default on a production backfill is a footgun.
    const dryRun = request.data?.dryRun !== false;

    const counts: Record<string, number> = {};
    let scanned = 0;
    let migrated = 0;
    let skipped = 0;
    let instructorIdBackfilled = 0;

    let cursor: admin.firestore.QueryDocumentSnapshot | null = null;

    for (;;) {
      let q = db.collection("bookings")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(BATCH_SIZE);
      if (cursor) q = q.startAfter(cursor.id);

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db.batch();
      let writesInBatch = 0;

      for (const doc of snap.docs) {
        scanned++;
        const data = doc.data() as {
          status: string;
          cancelledBy?: LegacyCancelledBy;
          providerId?: string;
          instructorId?: string | null;
          statusHistory?: unknown[];
          updatedAt?: admin.firestore.Timestamp;
          completionReminderSentAt?: unknown;
        };

        const needsStatus = !isAlreadyMigrated(data.status);
        // instructorId is the canonical trainer link; older docs only carry providerId.
        const needsInstructorId = !data.instructorId && !!data.providerId;
        const needsHistory = !Array.isArray(data.statusHistory) || data.statusHistory.length === 0;
        // Firestore cannot query for an absent field, so remindTrainerToComplete would
        // never see these docs unless the field exists.
        const needsReminderField = data.completionReminderSentAt === undefined;

        if (!needsStatus && !needsInstructorId && !needsHistory && !needsReminderField) {
          skipped++;
          continue;
        }

        const mapped = mapLegacyStatus(
          data.status as LegacyBookingStatus,
          data.cancelledBy
        );
        counts[mapped.status] = (counts[mapped.status] ?? 0) + 1;

        const update: admin.firestore.UpdateData<admin.firestore.DocumentData> = {};

        if (needsStatus) update.status = mapped.status;

        if (needsInstructorId) {
          update.instructorId = data.providerId;
          instructorIdBackfilled++;
        }

        if (needsHistory) {
          update.statusHistory = [{
            status: mapped.status,
            actorUid: "migration",
            actorRole: mapped.actorRole,
            at: data.updatedAt ?? admin.firestore.Timestamp.now(),
          }];
        }

        if (needsReminderField) update.completionReminderSentAt = null;
        if (data.completionReminderSentAt === undefined) {
          update.lateCancellation = false;
          update.paymentConfirmation = null;
        }

        if (!dryRun) {
          batch.update(doc.ref, update);
          writesInBatch++;
        }
        migrated++;
      }

      if (!dryRun && writesInBatch > 0) await batch.commit();

      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;
    }

    const result = { dryRun, scanned, migrated, skipped, instructorIdBackfilled, counts };
    logger.info("[migrate-bookings] complete", result);

    if (!dryRun) {
      const caller = (await db.collection("users").doc(uid).get()).data();
      await writeAuditLog({
        actorUid: uid,
        actorEmail: caller?.email ?? "",
        actorRole: "superadmin",
        action: "update",
        entityType: "booking",
        entityId: "*",
        after: result,
        reason: "Booking status enum migration (P0-1)",
      });
    }

    return result;
  }
);
