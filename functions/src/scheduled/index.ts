import { logger } from "firebase-functions";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { subHours, addDays } from "date-fns";
import { sendPushToUser } from "../notifications";
import { notifyTransition } from "../bookings/notify";
import { reminderContext, reminderKind } from "../bookings/notifyTargets";
import { buildMessage } from "../notifications/bookingMessages";
import {
  applyChallengeProgress,
  isCompletionTransition,
  isUserInboxNotification,
  runPaginatedCleanup,
} from "./maintenance";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * BulkWriter write promises reject individually; an un-awaited rejection would crash the
 * instance. Log it instead — the scheduled jobs are all safe to pick up on their next run.
 */
function guardWrite(p: Promise<unknown>): void {
  p.catch((err) => logger.error("Scheduled bulk write failed", err));
}

interface BookingData {
  userId: string;
  serviceName: string;
  /** Null for trainer sessions — reminders then name the trainer instead. */
  venueName?: string | null;
  instructorName?: string | null;
  scheduledAt: admin.firestore.Timestamp;
  scheduledEndAt?: admin.firestore.Timestamp;
  reminder24hSent?: boolean;
  reminder2hSent?: boolean;
  pointsEarned: number;
  status: string;
  /** Present on trainer sessions; absent on venue bookings. The discriminator throughout. */
  instructorId?: string | null;
  [key: string]: unknown;
}

/**
 * Send booking reminders (runs every hour)
 */
export const sendBookingReminders = onSchedule(
  {
    region,
    schedule: "0 * * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const now = new Date();
    const reminderWindow = {
      start: admin.firestore.Timestamp.fromDate(addDays(now, 0)),
      end: admin.firestore.Timestamp.fromDate(addDays(now, 1)),
    };

    // Get bookings scheduled for tomorrow that haven't received reminders.
    // "accepted" is the post-migration equivalent of the old "confirmed".
    const upcomingBookings = await db
      .collection("bookings")
      .where("status", "==", "accepted")
      .where("scheduledAt", ">=", reminderWindow.start)
      .where("scheduledAt", "<=", reminderWindow.end)
      .get();

    // Notifications (push + in-app, localized per recipient) go out concurrently. The flag
    // is set once delivery was attempted: the in-app doc is the durable record, and a
    // missing FCM token must not make the same reminder repeat every hour.
    const writer = db.bulkWriter();
    let sent = 0;
    const sends: Promise<void>[] = [];

    for (const doc of upcomingBookings.docs) {
      const booking = doc.data() as BookingData;
      const scheduledAt = booking.scheduledAt.toDate();
      const hoursUntil = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      const kind = reminderKind(hoursUntil, booking);
      if (!kind) continue;
      const field = kind === "reminder_24h" ? "reminder24hSent" : "reminder2hSent";

      sends.push(
        notifyTransition({
          recipientUid: booking.userId,
          event: kind,
          bookingId: doc.id,
          context: reminderContext(booking),
          // Keeps the type the client already knows; no email for hourly reminders.
          type: "booking_reminder",
          email: false,
        }).then(
          () => {
            guardWrite(writer.update(doc.ref, { [field]: true }));
            sent++;
          },
          (err) => logger.error(`Booking reminder failed for ${doc.id}`, err)
        )
      );
    }

    await Promise.all(sends);
    await writer.close();

    logger.info(`Processed ${upcomingBookings.size} bookings for reminders; sent ${sent}`);
  }
);

/**
 * Mark no-shows and complete past bookings (runs every 30 min)
 */
export const processCompletedBookings = onSchedule(
  {
    region,
    schedule: "*/30 * * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const now = new Date();
    const cutoffTime = admin.firestore.Timestamp.fromDate(subHours(now, 2));

    // Get accepted bookings that should have ended by now.
    // "accepted" is the post-migration equivalent of the old "confirmed".
    const pastBookings = await db
      .collection("bookings")
      .where("status", "==", "accepted")
      .where("scheduledEndAt", "<=", cutoffTime)
      .get();

    const batch = db.batch();
    let skippedTrainerBookings = 0;

    for (const doc of pastBookings.docs) {
      const booking = doc.data() as BookingData;

      // Trainer sessions are completed by the trainer tapping "Sessione svolta", never
      // automatically — the pilot needs a human-attested completion. completeBooking takes
      // over awarding pointsEarned for these. Venue bookings keep auto-completing here.
      if (booking.instructorId) {
        skippedTrainerBookings++;
        continue;
      }

      batch.update(doc.ref, {
        status: "completed",
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: "completed",
          actorUid: "system",
          actorRole: "system",
          at: admin.firestore.Timestamp.now(),
        }),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Award points
      if (booking.pointsEarned > 0) {
        const userRef = db.collection("users").doc(booking.userId);
        batch.update(userRef, {
          pointsBalance: admin.firestore.FieldValue.increment(booking.pointsEarned),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    logger.info(
      `Auto-completed ${pastBookings.size - skippedTrainerBookings} venue bookings; ` +
      `skipped ${skippedTrainerBookings} trainer bookings (completed by the trainer)`
    );
  }
);

/**
 * Nudge trainers to mark a session as done (runs every hour).
 *
 * Trainer sessions are never auto-completed — the pilot needs a human-attested
 * completion — so a trainer who forgets would strand the booking before `completed`
 * and it would never reach `payment_confirmed`. Spec §8.
 */
export const remindTrainerToComplete = onSchedule(
  {
    region,
    schedule: "15 * * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const cutoff = admin.firestore.Timestamp.fromDate(subHours(new Date(), 2));

    // completionReminderSentAt is initialized to null on create and by the migration —
    // Firestore cannot query for an absent field, so it must exist to be matched here.
    const stale = await db
      .collection("bookings")
      .where("status", "==", "accepted")
      .where("scheduledEndAt", "<=", cutoff)
      .where("completionReminderSentAt", "==", null)
      .get();

    // venue bookings auto-complete elsewhere
    const trainerBookings = stale.docs.filter((d) => (d.data() as BookingData).instructorId);

    // One read per distinct trainer, not per booking.
    const trainerIds = [...new Set(trainerBookings.map((d) => (d.data() as BookingData).instructorId as string))];
    const localeByTrainer = new Map<string, string | undefined>();
    if (trainerIds.length > 0) {
      const trainerSnaps = await db.getAll(...trainerIds.map((id) => db.collection("users").doc(id)));
      for (const snap of trainerSnaps) localeByTrainer.set(snap.id, snap.data()?.preferredLanguage);
    }

    const writer = db.bulkWriter();
    let sent = 0;
    await Promise.all(trainerBookings.map(async (doc) => {
      const booking = doc.data() as BookingData;
      const instructorId = booking.instructorId as string;
      const message = buildMessage("completion_reminder", localeByTrainer.get(instructorId), {
        serviceName: booking.serviceName,
      });

      try {
        await sendPushToUser(instructorId, {
          title: message.title,
          body: message.body,
          data: { bookingId: doc.id, type: "booking_completion_reminder" },
        });
      } catch (err) {
        logger.error(`Completion reminder push failed for ${doc.id}`, err);
        return;
      }

      guardWrite(writer.create(db.collection("users").doc(instructorId).collection("notifications").doc(), {
        title: message.title,
        body: message.body,
        type: "booking_completion_reminder",
        data: { bookingId: doc.id },
        imageUrl: null,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
      guardWrite(writer.update(doc.ref, {
        completionReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
      sent++;
    }));
    await writer.close();

    logger.info(`Sent ${sent} completion reminders to trainers`);
  }
);

/**
 * Auto-confirm payments the client never responded to (runs every hour).
 *
 * Client confirmation is optional by design; silence for 48h is treated as agreement so
 * a booking is not left hanging. A dispute, by contrast, flags it for admin review.
 * Spec §8.
 *
 * Awards NO XP: the "service received" XP is earned only by the client's own confirmation
 * (see bookings/serviceReceived.ts). `clientResponse` stays null here, so the client can
 * still confirm afterwards and collect it.
 */
export const autoConfirmPayments = onSchedule(
  {
    region,
    schedule: "45 * * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const cutoff = admin.firestore.Timestamp.fromDate(subHours(new Date(), 48));

    const pending = await db
      .collection("bookings")
      .where("status", "==", "payment_confirmed")
      .where("paymentConfirmation.clientResponse", "==", null)
      .where("paymentConfirmation.confirmedByTrainerAt", "<=", cutoff)
      .get();

    // clientResponse stays null after auto-confirming, so the query keeps matching these;
    // skip the ones already closed rather than re-stamping them every hour.
    const toClose = pending.docs.filter(
      (doc) => doc.get("paymentConfirmation.autoConfirmed") !== true
    );

    const batch = db.batch();
    for (const doc of toClose) {
      batch.update(doc.ref, {
        "paymentConfirmation.autoConfirmed": true,
        "paymentConfirmation.clientRespondedAt": admin.firestore.FieldValue.serverTimestamp(),
        "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    logger.info(`Auto-confirmed ${toClose.length} payments after the 48h window`);
  }
);

/**
 * Expire VIP subscriptions (runs daily at midnight)
 */
export const expireVipSubscriptions = onSchedule(
  {
    region,
    schedule: "0 0 * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const now = admin.firestore.Timestamp.now();

    const expiredVips = await db
      .collection("users")
      .where("isVip", "==", true)
      .where("vipExpiresAt", "<=", now)
      .get();

    // Needs the users (isVip, vipExpiresAt) composite index in firestore.indexes.json.
    // BulkWriter rather than one batch: no 500-write ceiling, no sequential awaits.
    const writer = db.bulkWriter();

    for (const doc of expiredVips.docs) {
      guardWrite(writer.update(doc.ref, {
        isVip: false,
        vipPlanId: null,
        vipExpiresAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));

      // Send notification
      guardWrite(writer.create(db.collection("users").doc(doc.id).collection("notifications").doc(), {
        title: "Abbonamento VIP scaduto",
        body: "Il tuo abbonamento VIP è scaduto. Rinnova per continuare a godere dei vantaggi esclusivi!",
        type: "vip",
        data: {},
        imageUrl: null,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
    }

    await writer.close();
    logger.info(`Expired ${expiredVips.size} VIP subscriptions`);
  }
);

/**
 * Expire promotion codes (runs daily)
 */
export const expirePromotions = onSchedule(
  {
    region,
    schedule: "0 1 * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const now = admin.firestore.Timestamp.now();

    const expiredPromos = await db
      .collection("promotions")
      .where("isActive", "==", true)
      .where("validUntil", "<=", now)
      .get();

    // Needs the promotions (isActive, validUntil) composite index in firestore.indexes.json.
    const writer = db.bulkWriter();
    for (const doc of expiredPromos.docs) {
      guardWrite(writer.update(doc.ref, { isActive: false }));
    }
    await writer.close();
    logger.info(`Expired ${expiredPromos.size} promotions`);
  }
);

/**
 * Daily stats aggregation was REMOVED in P0-2 (2026-08-09).
 *
 * It wrote a `dailyStats` collection that nothing ever read. Its replacement is
 * `aggregateMetricsDaily` in functions/src/metrics/daily.ts, which computes the full
 * metric set into `metrics_daily`. The Cloud Scheduler job for this function must be
 * deleted so two jobs do not write overlapping aggregates.
 */


/** Page size and wall-clock budget for cleanupOldNotifications. */
const CLEANUP_PAGE_SIZE = 500;
const CLEANUP_TIMEOUT_SECONDS = 540;
const CLEANUP_BUDGET_MS = 480_000; // leave headroom under the timeout to flush and log

/**
 * Clean up old notifications (runs weekly)
 *
 * One collection-group query over every users/{uid}/notifications inbox (read, older than
 * 30 days), cursor-paginated and deleted through a BulkWriter, until it runs dry or the time
 * budget is spent — whatever is left is picked up next week. Needs the COLLECTION_GROUP
 * (isRead, createdAt) index on `notifications` in firestore.indexes.json.
 */
export const cleanupOldNotifications = onSchedule(
  {
    region,
    schedule: "0 3 * * 0",
    timeZone: "Europe/Rome",
    timeoutSeconds: CLEANUP_TIMEOUT_SECONDS,
  },
  async (_event: ScheduledEvent) => {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(addDays(new Date(), -30));
    const baseQuery = db
      .collectionGroup("notifications")
      .where("isRead", "==", true)
      .where("createdAt", "<=", thirtyDaysAgo)
      .orderBy("createdAt", "asc");

    const writer = db.bulkWriter();
    let failed = 0;
    writer.onWriteError((err) => {
      if (err.failedAttempts < 3) return true;
      failed++;
      logger.warn(`Could not delete ${err.documentRef.path}: ${err.message}`);
      return false;
    });

    type Snap = admin.firestore.QueryDocumentSnapshot;
    const result = await runPaginatedCleanup<Snap>(
      {
        fetchPage: async (cursor, limit) => {
          const q = cursor ? baseQuery.startAfter(cursor).limit(limit) : baseQuery.limit(limit);
          return (await q.get()).docs;
        },
        isEligible: (doc) => isUserInboxNotification(doc.ref),
        enqueueDelete: (doc) => {
          // Rejections are handled (and counted) by onWriteError above.
          writer.delete(doc.ref).catch(() => undefined);
        },
        flush: () => writer.flush(),
        now: () => Date.now(),
      },
      { pageSize: CLEANUP_PAGE_SIZE, deadlineMs: Date.now() + CLEANUP_BUDGET_MS }
    );
    await writer.close();

    logger.info(
      `Cleaned up ${result.deleted - failed} old notifications over ${result.pages} page(s)` +
      (failed ? `; ${failed} deletes failed` : "") +
      (result.exhausted ? "" : "; time budget spent, the rest carries over to next run")
    );
  }
);

/**
 * Update challenge progress (triggered by booking completion)
 *
 * Fires on every bookings update, so it exits before any read unless this update is the
 * transition into `completed`. The progress itself is applied in one transaction together
 * with a per-booking ledger entry (applyChallengeProgress), so a retried delivery neither
 * double-counts nor re-sends the "challenge completed" push.
 */
export const updateChallengeProgress = onDocumentUpdated(
  {
    region,
    document: "bookings/{bookingId}",
  },
  async (event) => {
    if (!event.data) return;

    const before = event.data.before.data() as BookingData | undefined;
    const after = event.data.after.data() as BookingData | undefined;
    if (!isCompletionTransition(before, after) || !after?.userId) return;

    const userId = after.userId;
    const result = await applyChallengeProgress(db, {
      userId,
      bookingId: event.params.bookingId,
      eventId: event.id,
    });

    if (result.alreadyApplied) {
      logger.info(`Challenge progress for booking ${event.params.bookingId} already applied; skipping`);
      return;
    }

    await Promise.all(result.completed.map((challenge) =>
      sendPushToUser(userId, {
        title: "Sfida completata!",
        body: `Hai completato "${challenge.title}" e guadagnato ${challenge.pointsReward} punti!`,
        data: { challengeId: challenge.id, type: "challenge" },
      }).catch((err) => logger.error(`Challenge push failed for ${userId}/${challenge.id}`, err))
    ));
  }
);
