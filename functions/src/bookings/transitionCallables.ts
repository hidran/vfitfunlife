/**
 * Trainer-facing booking transition callables.
 *
 * Every one delegates to the pure `canTransition` guard in ./transitions — the rules are
 * defined once, not re-derived per call site. All of these run with Admin SDK privileges,
 * which is why Firestore rules can deny client and trainer writes to `status` outright.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §8
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { getUserRoleInfo } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { EMAIL_SECRETS } from "../lib/email";
import { canTransition } from "./transitions";
import { notifyTransition } from "./notify";
import type { BookingStatus, StatusActorRole, TransitionActorRole } from "./types";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface TransitionRequest {
  bookingId: string;
  note?: string;
}

interface BookingDoc {
  userId: string;
  instructorId?: string | null;
  status: BookingStatus;
  serviceName?: string;
  scheduledAt: admin.firestore.Timestamp;
  scheduledEndAt?: admin.firestore.Timestamp;
  pointsEarned?: number;
  [key: string]: unknown;
}

/** Resolves how the caller relates to this booking. Admin outranks the others. */
async function resolveActorRole(
  uid: string,
  booking: BookingDoc
): Promise<TransitionActorRole> {
  const info = await getUserRoleInfo(uid);
  if (info?.isActive === false) {
    throw new HttpsError("permission-denied", "Account is deactivated");
  }
  if (info?.role === "admin" || info?.role === "superadmin") return "admin";
  if (booking.instructorId === uid) return "trainer";
  if (booking.userId === uid) return "client";
  throw new HttpsError("permission-denied", "Not a participant in this booking");
}

export interface ApplyTransitionOptions {
  request: CallableRequest<TransitionRequest>;
  to: BookingStatus;
  /** Extra document fields to write alongside the status. */
  extraFields?: (booking: BookingDoc, uid: string) => Record<string, unknown>;
  /**
   * Documents to read before any write. Firestore transactions require all reads to
   * precede all writes, so a side effect that needs to check a document must declare it
   * here rather than reading inline.
   */
  prefetch?: (booking: BookingDoc) => admin.firestore.DocumentReference[];
  /** Runs inside the same transaction — used to award loyalty points. */
  sideEffects?: (
    tx: admin.firestore.Transaction,
    booking: BookingDoc,
    bookingId: string,
    prefetched: admin.firestore.DocumentSnapshot[]
  ) => void;
  /** Who to notify, and about what. */
  notify?: (booking: BookingDoc, uid: string) => {
    recipientUid: string;
    event: Parameters<typeof notifyTransition>[0]["event"];
    context?: Record<string, unknown>;
  } | null;
}

export async function applyTransition(opts: ApplyTransitionOptions) {
  const { request, to } = opts;
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");

  const uid = request.auth.uid;
  const bookingId = request.data?.bookingId;
  if (!bookingId) throw new HttpsError("invalid-argument", "Missing bookingId");

  const note = typeof request.data.note === "string" ? request.data.note.slice(0, 500) : undefined;
  const ref = db.collection("bookings").doc(bookingId);
  const now = new Date();

  const { booking, actorRole } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Booking not found");
    const doc = snap.data() as BookingDoc;

    const role = await resolveActorRole(uid, doc);

    const verdict = canTransition({
      from: doc.status,
      to,
      actorRole: role,
      actorUid: uid,
      booking: {
        userId: doc.userId,
        instructorId: doc.instructorId,
        scheduledAt: doc.scheduledAt.toDate(),
        scheduledEndAt: (doc.scheduledEndAt ?? doc.scheduledAt).toDate(),
      },
      now,
    });

    if (!verdict.ok) {
      throw new HttpsError("failed-precondition", verdict.reason);
    }

    // All reads must happen before the first write in a Firestore transaction.
    const prefetched = opts.prefetch ?
      await Promise.all(opts.prefetch(doc).map((r) => tx.get(r))) :
      [];

    const historyRole: StatusActorRole = role;
    tx.update(ref, {
      status: to,
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status: to,
        actorUid: uid,
        actorRole: historyRole,
        at: admin.firestore.Timestamp.now(),
        ...(note ? { note } : {}),
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(opts.extraFields?.(doc, uid) ?? {}),
    });

    opts.sideEffects?.(tx, doc, bookingId, prefetched);

    return { booking: doc, actorRole: role };
  });

  // Notifications and audit run after the transaction commits — neither may roll it back.
  const target = opts.notify?.(booking, uid);
  if (target) {
    await notifyTransition({
      recipientUid: target.recipientUid,
      event: target.event,
      bookingId,
      context: { serviceName: booking.serviceName, ...target.context },
    });
  }

  if (actorRole === "admin") {
    const caller = (await db.collection("users").doc(uid).get()).data();
    await writeAuditLog({
      actorUid: uid,
      actorEmail: caller?.email ?? "",
      actorRole: caller?.role === "superadmin" ? "superadmin" : "admin",
      action: "update",
      entityType: "booking",
      entityId: bookingId,
      before: { status: booking.status },
      after: { status: to },
      ...(note ? { reason: note } : {}),
    });
  }

  return { success: true, bookingId, status: to };
}

export const acceptBooking = onCall<TransitionRequest>(
  { region, secrets: EMAIL_SECRETS },
  (request) => applyTransition({
    request,
    to: "accepted",
    extraFields: (_b, uid) => ({
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: uid,
    }),
    notify: (b) => ({ recipientUid: b.userId, event: "accepted" }),
  })
);

export const declineBooking = onCall<TransitionRequest>(
  { region, secrets: EMAIL_SECRETS },
  (request) => applyTransition({
    request,
    to: "declined",
    notify: (b) => ({ recipientUid: b.userId, event: "declined" }),
  })
);

export const cancelBookingAsTrainer = onCall<TransitionRequest>(
  { region, secrets: EMAIL_SECRETS },
  (request) => applyTransition({
    request,
    to: "cancelled_by_trainer",
    extraFields: (b) => ({
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledBy: "provider",
      cancellationReason: request.data?.note ?? null,
      // PILOT: flagged for data collection only — no fees in the pilot.
      lateCancellation:
        b.scheduledAt.toDate().getTime() - Date.now() < 24 * 60 * 60 * 1000,
    }),
    notify: (b) => ({ recipientUid: b.userId, event: "cancelled_by_trainer" }),
  })
);

interface CompleteRequest extends TransitionRequest {
  noShow?: boolean;
}

/**
 * Marks a session done. The two branches are deliberately asymmetric:
 * `completed` writes `completedAt` and awards loyalty points; `no_show` does neither.
 *
 * Awarding points for a session the client did not attend would be wrong on its own, and
 * `completedAt` feeds `aggregateDailyStats.completedSessions` and the P0-2 metric — so a
 * no-show must not inflate it. Spec §8.
 */
export const completeBooking = onCall<CompleteRequest>(
  { region, secrets: EMAIL_SECRETS },
  (request) => {
    const noShow = request.data?.noShow === true;

    return applyTransition({
      request,
      to: noShow ? "no_show" : "completed",

      extraFields: (_b, uid) => noShow ?
        {} :
        {
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedBy: uid,
        },

      prefetch: (booking) => noShow ? [] : [db.collection("users").doc(booking.userId)],

      sideEffects: (tx, booking, _bookingId, prefetched) => {
        if (noShow) return;
        // Taken over from processCompletedBookings, which now skips trainer bookings.
        const points = booking.pointsEarned ?? 0;
        if (points <= 0) return;

        // The client's user doc can be missing — a deleted account, or seed data that
        // never had one. tx.update() would throw NOT_FOUND and roll back the whole
        // transaction, leaving the trainer permanently unable to mark the session done.
        // Awarding points is secondary to recording that the session happened.
        const userSnap = prefetched[0];
        if (!userSnap?.exists) {
          logger.warn("[completeBooking] client user doc missing; skipping points award", {
            userId: booking.userId, bookingId: _bookingId,
          });
          return;
        }

        tx.update(userSnap.ref, {
          pointsBalance: admin.firestore.FieldValue.increment(points),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      },

      notify: (b) => noShow ? null : { recipientUid: b.userId, event: "completed" },
    });
  }
);
