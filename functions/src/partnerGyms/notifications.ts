import { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { region } from "../lib/runtimeOptions";
import { buildMessage, type BookingMessageEvent } from "../notifications/bookingMessages";
import { sendPushToUser } from "../notifications";
import { db, serverTime } from "./store";

export function queueGymNotification(
  tx: { set: (ref: DocumentReference, data: DocumentData) => unknown },
  id: string, uid: string, event: BookingMessageEvent, title: string, startsAt?: Date, reason = ""
) {
  tx.set(db.doc(`gymNotifications/${id}`), {
    uid, event, title, startsAt: startsAt ?? null, reason, createdAt: serverTime(),
  });
}

export const onGymNotification = onDocumentCreated(
  { region, document: "gymNotifications/{id}" }, async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const user = (await db.doc(`users/${data.uid}`).get()).data();
    const message = buildMessage(data.event, user?.preferredLanguage, {
      serviceName: data.title, startsAt: data.startsAt?.toDate(), reason: data.reason,
    });
    const link = "/bookings?tab=gym";
    const target = db.doc(`users/${data.uid}/notifications/gym_${event.params.id}`);
    try {
      await target.create({ ...message, type: "gym_class", data: { link },
        isRead: false, createdAt: serverTime() });
    } catch (error) {
      if ((error as { code?: number }).code === 6) return;
      throw error;
    }
    await sendPushToUser(data.uid, { ...message, data: { type: "gym_class", link } });
  }
);
