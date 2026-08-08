import { logger } from "firebase-functions";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { subHours, addDays, startOfDay, endOfDay } from "date-fns";
import { sendPushToUser } from "../notifications";
import { buildMessage } from "../notifications/bookingMessages";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface BookingData {
  userId: string;
  serviceName: string;
  venueName: string;
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

interface UserChallengeData {
  challengeId: string;
  currentProgress: number;
  [key: string]: unknown;
}

interface ChallengeData {
  id: string;
  title: string;
  challengeType: string;
  targetValue: number;
  pointsReward: number;
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

    for (const doc of upcomingBookings.docs) {
      const booking = doc.data() as BookingData;
      const scheduledAt = booking.scheduledAt.toDate();
      const hoursUntil = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Send 24h reminder
      if (hoursUntil >= 23 && hoursUntil <= 25 && !booking.reminder24hSent) {
        await sendPushToUser(booking.userId, {
          title: "Promemoria prenotazione",
          body: `Ricorda: domani hai ${booking.serviceName} presso ${booking.venueName}`,
          data: { bookingId: doc.id, type: "booking_reminder" },
        });

        await doc.ref.update({ reminder24hSent: true });
      }

      // Send 2h reminder
      if (hoursUntil >= 1.5 && hoursUntil <= 2.5 && !booking.reminder2hSent) {
        await sendPushToUser(booking.userId, {
          title: "Tra poco!",
          body: `${booking.serviceName} inizia tra 2 ore presso ${booking.venueName}`,
          data: { bookingId: doc.id, type: "booking_reminder" },
        });

        await doc.ref.update({ reminder2hSent: true });
      }
    }

    logger.info(`Processed ${upcomingBookings.size} bookings for reminders`);
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

    let sent = 0;
    for (const doc of stale.docs) {
      const booking = doc.data() as BookingData;
      if (!booking.instructorId) continue; // venue bookings auto-complete elsewhere

      const trainerSnap = await db.collection("users").doc(booking.instructorId).get();
      const locale = trainerSnap.data()?.preferredLanguage;
      const message = buildMessage("completion_reminder", locale, {
        serviceName: booking.serviceName,
      });

      await sendPushToUser(booking.instructorId, {
        title: message.title,
        body: message.body,
        data: { bookingId: doc.id, type: "booking_completion_reminder" },
      });

      await db.collection("users").doc(booking.instructorId).collection("notifications").add({
        title: message.title,
        body: message.body,
        type: "booking_completion_reminder",
        data: { bookingId: doc.id },
        imageUrl: null,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await doc.ref.update({
        completionReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      sent++;
    }

    logger.info(`Sent ${sent} completion reminders to trainers`);
  }
);

/**
 * Auto-confirm payments the client never responded to (runs every hour).
 *
 * Client confirmation is optional by design; silence for 48h is treated as agreement so
 * a booking is not left hanging. A dispute, by contrast, flags it for admin review.
 * Spec §8.
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

    const batch = db.batch();
    for (const doc of pending.docs) {
      batch.update(doc.ref, {
        "paymentConfirmation.autoConfirmed": true,
        "paymentConfirmation.clientRespondedAt": admin.firestore.FieldValue.serverTimestamp(),
        "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    logger.info(`Auto-confirmed ${pending.size} payments after the 48h window`);
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

    const batch = db.batch();

    for (const doc of expiredVips.docs) {
      batch.update(doc.ref, {
        isVip: false,
        vipPlanId: null,
        vipExpiresAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send notification
      await db.collection("users").doc(doc.id).collection("notifications").add({
        title: "Abbonamento VIP scaduto",
        body: "Il tuo abbonamento VIP è scaduto. Rinnova per continuare a godere dei vantaggi esclusivi!",
        type: "vip",
        data: {},
        imageUrl: null,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
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

    const batch = db.batch();

    for (const doc of expiredPromos.docs) {
      batch.update(doc.ref, { isActive: false });
    }

    await batch.commit();
    logger.info(`Expired ${expiredPromos.size} promotions`);
  }
);

/**
 * Daily stats aggregation (runs at 2 AM)
 */
export const aggregateDailyStats = onSchedule(
  {
    region,
    schedule: "0 2 * * *",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const yesterday = startOfDay(addDays(new Date(), -1));
    const yesterdayEnd = endOfDay(yesterday);

    const startTimestamp = admin.firestore.Timestamp.fromDate(yesterday);
    const endTimestamp = admin.firestore.Timestamp.fromDate(yesterdayEnd);

    // Count new users
    const newUsers = await db
      .collection("users")
      .where("createdAt", ">=", startTimestamp)
      .where("createdAt", "<=", endTimestamp)
      .count()
      .get();

    // Count bookings
    const bookings = await db
      .collection("bookings")
      .where("createdAt", ">=", startTimestamp)
      .where("createdAt", "<=", endTimestamp)
      .get();

    const totalRevenue = bookings.docs.reduce((sum, doc) => {
      const data = doc.data();
      return data.paymentStatus === "paid" ? sum + data.finalPrice : sum;
    }, 0);

    // Count completed sessions
    const completedSessions = await db
      .collection("bookings")
      .where("completedAt", ">=", startTimestamp)
      .where("completedAt", "<=", endTimestamp)
      .count()
      .get();

    // Save daily stats
    const dateStr = yesterday.toISOString().split("T")[0];
    await db.collection("dailyStats").doc(dateStr).set({
      date: startTimestamp,
      newUsers: newUsers.data().count,
      totalBookings: bookings.size,
      completedSessions: completedSessions.data().count,
      totalRevenue,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Daily stats aggregated for ${dateStr}`);
  }
);

/**
 * Clean up old notifications (runs weekly)
 */
export const cleanupOldNotifications = onSchedule(
  {
    region,
    schedule: "0 3 * * 0",
    timeZone: "Europe/Rome",
  },
  async (_event: ScheduledEvent) => {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(addDays(new Date(), -30));

    // Get all users
    const users = await db.collection("users").get();

    let totalDeleted = 0;

    for (const userDoc of users.docs) {
      const oldNotifs = await db
        .collection("users")
        .doc(userDoc.id)
        .collection("notifications")
        .where("isRead", "==", true)
        .where("createdAt", "<=", thirtyDaysAgo)
        .limit(100)
        .get();

      if (!oldNotifs.empty) {
        const batch = db.batch();
        oldNotifs.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += oldNotifs.size;
      }
    }

    logger.info(`Cleaned up ${totalDeleted} old notifications`);
  }
);

/**
 * Update challenge progress (triggered by booking completion)
 */
export const updateChallengeProgress = onDocumentUpdated(
  {
    region,
    document: "bookings/{bookingId}",
  },
  async (event) => {
    if (!event.data) {
      return;
    }

    const before = event.data.before.data() as BookingData | undefined;
    const after = event.data.after.data() as BookingData | undefined;

    if (!before || !after) {
      return;
    }

    // Only process when booking becomes completed
    if (before.status !== "completed" && after.status === "completed") {
      const userId = after.userId;

      // Get active challenges for user
      const userChallenges = await db
        .collection("users")
        .doc(userId)
        .collection("userChallenges")
        .where("status", "==", "in_progress")
        .get();

      for (const ucDoc of userChallenges.docs) {
        const userChallenge = ucDoc.data() as UserChallengeData;

        // Get challenge details
        const challengeDoc = await db
          .collection("challenges")
          .doc(userChallenge.challengeId)
          .get();
        const challenge = challengeDoc.data() as ChallengeData;

        if (!challenge) continue;

        let newProgress = userChallenge.currentProgress;

        // Update progress based on challenge type
        switch (challenge.challengeType) {
        case "total_classes":
          newProgress += 1;
          break;
        case "streak":
          // Streak logic would need date tracking
          newProgress = userChallenge.currentProgress + 1;
          break;
        }

        // Check if completed
        if (newProgress >= challenge.targetValue) {
          // Award points
          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const userData = userDoc.data();

          await userRef.update({
            pointsBalance: admin.firestore.FieldValue.increment(challenge.pointsReward),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await db.collection("users").doc(userId).collection("pointsTransactions").add({
            points: challenge.pointsReward,
            type: "bonus",
            source: "challenge",
            sourceId: challenge.id,
            description: `Sfida completata: ${challenge.title}`,
            balanceAfter: (userData?.pointsBalance || 0) + challenge.pointsReward,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await ucDoc.ref.update({
            currentProgress: newProgress,
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Send notification
          await sendPushToUser(userId, {
            title: "Sfida completata!",
            body: `Hai completato "${challenge.title}" e guadagnato ${challenge.pointsReward} punti!`,
            data: { challengeId: challenge.id, type: "challenge" },
          });
        } else {
          await ucDoc.ref.update({
            currentProgress: newProgress,
          });
        }
      }
    }
  }
);
