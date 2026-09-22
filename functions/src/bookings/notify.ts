/**
 * Notification fan-out for booking transitions: push + in-app + email, in the
 * recipient's language.
 *
 * Spec: docs/superpowers/specs/2026-08-08-booking-manual-payment-design.md §9
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { sendPushToUser } from "../notifications";
import { buildMessage, type BookingMessageEvent, type MessageContext }
  from "../notifications/bookingMessages";
import { sendEmail } from "../lib/email";

const db = admin.firestore();

interface Recipient {
  uid: string;
  email?: string | null;
  locale?: unknown;
}

async function loadRecipient(uid: string): Promise<Recipient> {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data();
  return { uid, email: data?.email ?? null, locale: data?.preferredLanguage };
}

/**
 * Delivers one transition notification across all three channels.
 *
 * Push and email failures are logged and swallowed — a transition must never fail
 * because a notification did. The in-app write is the durable record.
 */
export async function notifyTransition(opts: {
  recipientUid: string;
  event: BookingMessageEvent;
  bookingId: string;
  context?: MessageContext;
}): Promise<void> {
  const { recipientUid, event, bookingId, context = {} } = opts;

  let recipient: Recipient;
  try {
    recipient = await loadRecipient(recipientUid);
  } catch (err) {
    logger.warn("[booking-notify] could not load recipient", { recipientUid, err });
    return;
  }

  const message = buildMessage(event, recipient.locale, context);
  const type = `booking_${event}`;

  await Promise.allSettled([
    sendPushToUser(recipientUid, {
      title: message.title,
      body: message.body,
      data: { bookingId, type },
    }),

    db.collection("users").doc(recipientUid).collection("notifications").add({
      title: message.title,
      body: message.body,
      type,
      data: { bookingId },
      imageUrl: null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    }),

    recipient.email ?
      sendEmail({ to: recipient.email, subject: message.title, body: message.body }) :
      Promise.resolve(false),
  ]).then((results) => {
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.warn("[booking-notify] channel failed", {
          channel: ["push", "in-app", "email"][i],
          bookingId,
          event,
          reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  });
}
