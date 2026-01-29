import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { subHours, addDays, startOfDay, endOfDay, isBefore } from "date-fns";
import { sendPushToUser } from "../notifications";

const db = admin.firestore();

/**
 * Send booking reminders (runs every hour)
 */
export const sendBookingReminders = functions.pubsub
  .schedule("0 * * * *")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
    const now = new Date();
    const reminderWindow = {
      start: admin.firestore.Timestamp.fromDate(addDays(now, 0)),
      end: admin.firestore.Timestamp.fromDate(addDays(now, 1)),
    };

    // Get bookings scheduled for tomorrow that haven't received reminders
    const upcomingBookings = await db
      .collection("bookings")
      .where("status", "==", "confirmed")
      .where("scheduledAt", ">=", reminderWindow.start)
      .where("scheduledAt", "<=", reminderWindow.end)
      .get();

    for (const doc of upcomingBookings.docs) {
      const booking = doc.data();
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

    functions.logger.info(`Processed ${upcomingBookings.size} bookings for reminders`);
  });

/**
 * Mark no-shows and complete past bookings (runs every 30 min)
 */
export const processCompletedBookings = functions.pubsub
  .schedule("*/30 * * * *")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
    const now = new Date();
    const cutoffTime = admin.firestore.Timestamp.fromDate(subHours(now, 2));

    // Get confirmed bookings that should have ended by now
    const pastBookings = await db
      .collection("bookings")
      .where("status", "==", "confirmed")
      .where("scheduledEndAt", "<=", cutoffTime)
      .get();

    const batch = db.batch();

    for (const doc of pastBookings.docs) {
      const booking = doc.data();

      // Mark as completed (in a real app, this might need staff confirmation)
      batch.update(doc.ref, {
        status: "completed",
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
    functions.logger.info(`Completed ${pastBookings.size} bookings`);
  });

/**
 * Expire VIP subscriptions (runs daily at midnight)
 */
export const expireVipSubscriptions = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
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
    functions.logger.info(`Expired ${expiredVips.size} VIP subscriptions`);
  });

/**
 * Expire promotion codes (runs daily)
 */
export const expirePromotions = functions.pubsub
  .schedule("0 1 * * *")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
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
    functions.logger.info(`Expired ${expiredPromos.size} promotions`);
  });

/**
 * Daily stats aggregation (runs at 2 AM)
 */
export const aggregateDailyStats = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
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

    functions.logger.info(`Daily stats aggregated for ${dateStr}`);
  });

/**
 * Clean up old notifications (runs weekly)
 */
export const cleanupOldNotifications = functions.pubsub
  .schedule("0 3 * * 0")
  .timeZone("Europe/Rome")
  .onRun(async (context) => {
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

    functions.logger.info(`Cleaned up ${totalDeleted} old notifications`);
  });

/**
 * Update challenge progress (triggered by booking completion)
 */
export const updateChallengeProgress = functions.firestore
  .document("bookings/{bookingId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

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
        const userChallenge = ucDoc.data();

        // Get challenge details
        const challengeDoc = await db
          .collection("challenges")
          .doc(userChallenge.challengeId)
          .get();
        const challenge = challengeDoc.data();

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
  });
