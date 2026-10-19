import { DocumentReference, DocumentData } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { region } from "../lib/runtimeOptions";
import { buildMessage, BookingMessageEvent } from "../notifications/bookingMessages";
import { sendPushToUser } from "../notifications";
import { sendEmail, EMAIL_SECRETS } from "../lib/email";
import { db, nowStamp } from "./store";
import { createHash } from "crypto";

export function queueCourseNotification(
  tx: { set: (ref: DocumentReference, data: DocumentData) => unknown },
  id: string, event: BookingMessageEvent, uid: string,
  course: { name: string; providerName?: string; providerId?: string }, startsAt?: Date, reason?: string, email = true
): void {
  const key = `${id}_${event}_${uid}`;
  const documentId = Buffer.byteLength(key, "utf8") > 1400 ? createHash("sha256").update(key).digest("hex") : key;
  tx.set(db.doc(`courseNotifications/${documentId}`), {
    uid, event, sendEmail: email, link: uid === course.providerId ? "/provider/courses" : "/courses?tab=bookings",
    name: course.name, providerName: course.providerName ?? "", startsAt: startsAt ?? null,
    reason: reason ?? "", createdAt: nowStamp(),
  });
}
export const onCourseNotification = onDocumentCreated(
  { region, document: "courseNotifications/{id}", secrets: EMAIL_SECRETS }, async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const user = (await db.doc(`users/${data.uid}`).get()).data();
    const message = buildMessage(data.event, user?.preferredLanguage, {
      serviceName: data.name, trainerName: data.providerName, startsAt: data.startsAt?.toDate(), reason: data.reason,
    });
    const link = data.link ?? "/courses?tab=bookings";
    const target = db.doc(`users/${data.uid}/notifications/course_${event.params.id}`);
    try {
      await target.create({ ...message, type: "course", data: { link }, isRead: false, createdAt: nowStamp() });
    } catch (error) {
      if ((error as { code?: number }).code === 6) return;
      throw error;
    }
    await Promise.allSettled([
      sendPushToUser(data.uid, { ...message, data: { type: "course", link } }),
      user?.email && data.sendEmail !== false ?
        sendEmail({ to: user.email, subject: message.title, body: message.body }) : Promise.resolve(),
    ]);
  }
);
