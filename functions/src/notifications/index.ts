import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { defaultNotificationSettings, allFalseNotificationSettings } from "../types";

const db = admin.firestore();
const messaging = admin.messaging();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

interface FcmToken {
  token: string;
  platform: string;
  updatedAt: admin.firestore.Timestamp;
}

interface VipNotificationData {
  title: string;
  body: string;
  imageUrl?: string;
}

interface RegisterTokenData {
  token: string;
  platform: string;
}

interface NotificationActionData {
  notificationId: string;
}

interface BookingData {
  userId: string;
  serviceName: string;
  pointsEarned: number;
  cancelledBy?: string;
  status: string;
}

/**
 * Send push notification to a specific user
 * @param {string} userId - The ID of the user to send the notification to
 * @param {NotificationPayload} notification - The notification payload
 * @return {Promise<void>}
 */
export async function sendPushToUser(
  userId: string,
  notification: NotificationPayload
): Promise<void> {
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    return;
  }

  const notifSettings = userData.notificationSettings
    ?? (userData.notificationsEnabled === false ? allFalseNotificationSettings : defaultNotificationSettings);

  // Check at least one push channel is enabled before attempting delivery
  const anyPushEnabled = Object.values(notifSettings.push).some(Boolean);
  if (!anyPushEnabled) {
    return;
  }

  const tokens = userData.fcmTokens
    ?.filter((t: FcmToken) => t.token)
    .map((t: FcmToken) => t.token) || [];

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
          (t: FcmToken) => !invalidTokens.includes(t.token)
        );
        await db.collection("users").doc(userId).update({
          fcmTokens: updatedTokens,
        });
      }
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}

/**
 * Send notification to multiple users
 * @param {string[]} userIds - Array of user IDs to send the notification to
 * @param {NotificationPayload} notification - The notification payload
 * @return {Promise<void>}
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
export const sendVipNotification = onCall<VipNotificationData>(
  { region },
  async (request: CallableRequest<VipNotificationData>) => {
    // Admin check would go here
    const { title, body, imageUrl } = request.data;

    // Filter by isVip only; per-user push gating is handled inside sendPushToUser
    // (legacy notificationsEnabled filter removed — new users use notificationSettings)
    const vipUsers = await db
      .collection("users")
      .where("isVip", "==", true)
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
  }
);

/**
 * Register FCM token for a user
 */
export const registerFcmToken = onCall<RegisterTokenData>(
  { region },
  async (request: CallableRequest<RegisterTokenData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { token, platform } = request.data;

    if (!token || !platform) {
      throw new HttpsError("invalid-argument", "Token and platform required");
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    const fcmTokens = userData?.fcmTokens || [];

    // Remove existing token for this platform/device
    const filteredTokens = fcmTokens.filter((t: FcmToken) => t.token !== token);

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
  }
);

/**
 * Mark notification as read
 */
export const markNotificationRead = onCall<NotificationActionData>(
  { region },
  async (request: CallableRequest<NotificationActionData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { notificationId } = request.data;

    await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .doc(notificationId)
      .update({ isRead: true });

    return { success: true };
  }
);

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;

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
  }
);

/**
 * Trigger notification when booking status changes
 */
export const onBookingStatusChange = onDocumentUpdated(
  { region, document: "bookings/{bookingId}" },
  async (event) => {
    if (!event.data) {
      return;
    }

    const before = event.data.before.data() as BookingData | undefined;
    const after = event.data.after.data() as BookingData | undefined;
    const bookingId = event.params.bookingId;

    if (!before || !after) {
      return;
    }

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
  }
);
