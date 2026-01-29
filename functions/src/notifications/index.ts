import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

/**
 * Send push notification to a specific user
 */
export async function sendPushToUser(
  userId: string,
  notification: NotificationPayload
): Promise<void> {
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (!userData || !userData.notificationsEnabled) {
    return;
  }

  const tokens = userData.fcmTokens
    ?.filter((t: { token: string }) => t.token)
    .map((t: { token: string }) => t.token) || [];

  if (tokens.length === 0) {
    return;
  }

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
    },
    data: notification.data,
    android: {
      priority: "high",
      notification: {
        channelId: "vfit_default",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        const updatedTokens = userData.fcmTokens.filter(
          (t: { token: string }) => !invalidTokens.includes(t.token)
        );
        await db.collection("users").doc(userId).update({
          fcmTokens: updatedTokens,
        });
      }
    }
  } catch (error) {
    functions.logger.error("Error sending push notification:", error);
  }
}

/**
 * Send notification to multiple users
 */
export async function sendPushToUsers(
  userIds: string[],
  notification: NotificationPayload
): Promise<void> {
  const promises = userIds.map((userId) => sendPushToUser(userId, notification));
  await Promise.all(promises);
}

/**
 * Send notification to all VIP users
 */
export const sendVipNotification = functions.https.onCall(async (data, context) => {
  // Admin check would go here
  const { title, body, imageUrl } = data;

  const vipUsers = await db
    .collection("users")
    .where("isVip", "==", true)
    .where("notificationsEnabled", "==", true)
    .get();

  const userIds = vipUsers.docs.map((doc) => doc.id);

  await sendPushToUsers(userIds, { title, body, imageUrl });

  // Store in-app notifications
  const batch = db.batch();
  for (const userId of userIds) {
    const notifRef = db.collection("users").doc(userId).collection("notifications").doc();
    batch.set(notifRef, {
      title,
      body,
      type: "vip",
      data: {},
      imageUrl: imageUrl || null,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return { sentTo: userIds.length };
});

/**
 * Register FCM token for a user
 */
export const registerFcmToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const { token, platform } = data;
  const userId = context.auth.uid;

  if (!token || !platform) {
    throw new functions.https.HttpsError("invalid-argument", "Token and platform required");
  }

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  const fcmTokens = userData?.fcmTokens || [];

  // Remove existing token for this platform/device
  const filteredTokens = fcmTokens.filter((t: { token: string }) => t.token !== token);

  // Add new token
  filteredTokens.push({
    token,
    platform,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  // Keep only last 5 tokens
  const limitedTokens = filteredTokens.slice(-5);

  await userRef.update({
    fcmTokens: limitedTokens,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/**
 * Mark notification as read
 */
export const markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const { notificationId } = data;
  const userId = context.auth.uid;

  await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc(notificationId)
    .update({ isRead: true });

  return { success: true };
});

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }

  const userId = context.auth.uid;

  const unreadNotifs = await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .where("isRead", "==", false)
    .get();

  const batch = db.batch();
  unreadNotifs.docs.forEach((doc) => {
    batch.update(doc.ref, { isRead: true });
  });

  await batch.commit();

  return { markedCount: unreadNotifs.size };
});

/**
 * Trigger notification when booking status changes
 */
export const onBookingStatusChange = functions.firestore
  .document("bookings/{bookingId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const bookingId = context.params.bookingId;

    if (before.status === after.status) {
      return;
    }

    const userId = after.userId;
    let notification: NotificationPayload | null = null;

    switch (after.status) {
      case "confirmed":
        notification = {
          title: "Prenotazione confermata",
          body: `La tua prenotazione per ${after.serviceName} è stata confermata`,
          data: { bookingId, type: "booking_confirmed" },
        };
        break;

      case "cancelled":
        if (after.cancelledBy !== "user") {
          notification = {
            title: "Prenotazione cancellata",
            body: `La tua prenotazione per ${after.serviceName} è stata cancellata`,
            data: { bookingId, type: "booking_cancelled" },
          };
        }
        break;

      case "completed":
        notification = {
          title: "Sessione completata",
          body: `Hai guadagnato ${after.pointsEarned} punti! Lascia una recensione.`,
          data: { bookingId, type: "booking_completed" },
        };
        break;
    }

    if (notification) {
      await sendPushToUser(userId, notification);

      // Store in-app notification
      await db.collection("users").doc(userId).collection("notifications").add({
        ...notification,
        type: notification.data?.type || "system",
        imageUrl: null,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
