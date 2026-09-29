/**
 * conversations/{conversationId}/messages/{messageId} onCreate:
 *  1. conversation bookkeeping — lastMessage / lastMessageAt / lastSenderId and
 *     unread[recipient] += 1 (the client may only reset its own counter; see firestore.rules);
 *  2. notify the other participant — in-app (users/{uid}/notifications, same shape as
 *     bookings/notify.ts) + push — at most once per conversation per recipient per
 *     CHAT_NOTIFY_THROTTLE_MS. The throttle covers the in-app entry too: the chat inbox's unread
 *     badge already counts every message, and one notification per burst keeps the
 *     notification inbox readable.
 *
 * Both happen in one transaction that also stamps `processedAt` on the message, so an
 * at-least-once redelivery of the trigger neither double-counts unread nor re-notifies.
 *
 * Plan: docs/plans/2026-09-29-communication-booking-plan.md, task C4.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { sendPushToUser } from "../notifications";
import { buildChatNotification } from "./chatMessages";
import { planChatMessage, type MessagePlan } from "./planMessage";

const db = admin.firestore();

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function lastPushMillis(value: unknown): Record<string, number | undefined> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number | undefined> = {};
  for (const [uid, ts] of Object.entries(value as Record<string, unknown>)) {
    out[uid] = millis(ts) ?? undefined;
  }
  return out;
}

export const onChatMessageCreated = onDocumentCreated(
  { region, document: "conversations/{conversationId}/messages/{messageId}" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { conversationId, messageId } = event.params;
    const convRef = db.collection("conversations").doc(conversationId);
    const msgRef = snap.ref;

    let plan: MessagePlan = { kind: "skip", reason: "not run" };
    let senderId = "";
    let senderName: string | null = null;
    let senderPhoto: string | null = null;
    let text = "";

    await db.runTransaction(async (tx) => {
      const [convSnap, msgSnap] = await Promise.all([tx.get(convRef), tx.get(msgRef)]);
      // Never recreate a conversation that is gone (an update() would fail anyway).
      if (!convSnap.exists || !msgSnap.exists) {
        plan = { kind: "skip", reason: "conversation or message missing" };
        return;
      }
      const msg = msgSnap.data() ?? {};
      if (msg.processedAt) {
        plan = { kind: "skip", reason: "already processed" };
        return;
      }
      const conv = convSnap.data() ?? {};
      const now = Date.now();

      plan = planChatMessage(
        {
          participantIds: conv.participantIds,
          lastMessageAtMillis: millis(conv.lastMessageAt),
          lastSenderId: conv.lastSenderId ?? null,
          lastPushAtMillis: lastPushMillis(conv.lastPushAt),
        },
        { senderId: msg.senderId, text: msg.text, createdAtMillis: millis(msg.createdAt) },
        now
      );

      tx.update(msgRef, { processedAt: FieldValue.serverTimestamp() });
      if (plan.kind === "skip") return;

      senderId = msg.senderId as string;
      text = msg.text as string;
      const sender = (conv.participants ?? {})[senderId] ?? {};
      senderName = typeof sender.name === "string" ? sender.name : null;
      senderPhoto = typeof sender.photoUrl === "string" && sender.photoUrl ? sender.photoUrl : null;

      // FieldPath: uids are opaque — never splice them into a dotted string path.
      const updates: Array<FieldPath | unknown> = [
        new FieldPath("unread", plan.recipientId), FieldValue.increment(1),
      ];
      if (plan.updatePreview) {
        updates.push(
          "lastMessage", plan.preview,
          "lastMessageAt", msg.createdAt instanceof Timestamp ? msg.createdAt : FieldValue.serverTimestamp(),
          "lastSenderId", senderId
        );
      }
      if (plan.notify) {
        updates.push(new FieldPath("lastPushAt", plan.recipientId), Timestamp.fromMillis(now));
      }
      const [first, firstValue, ...rest] = updates;
      tx.update(convRef, first as FieldPath, firstValue, ...rest);
    });

    const done = plan as MessagePlan;
    if (done.kind === "skip") {
      if (done.reason !== "already processed") {
        logger.info("[chat] message not applied", { conversationId, messageId, reason: done.reason });
      }
      return;
    }
    if (!done.notify) return;

    await notifyRecipient({
      recipientId: done.recipientId,
      conversationId,
      senderId,
      senderName,
      senderPhoto,
      text,
    });
  }
);

async function notifyRecipient(opts: {
  recipientId: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderPhoto: string | null;
  text: string;
}): Promise<void> {
  const { recipientId, conversationId, senderId, senderName, senderPhoto, text } = opts;

  let user: admin.firestore.DocumentData | undefined;
  try {
    user = (await db.collection("users").doc(recipientId).get()).data();
  } catch (err) {
    logger.warn("[chat] could not load recipient", { recipientId, err });
  }

  const message = buildChatNotification(user?.preferredLanguage, senderName, text);
  const type = "chat_message";
  // The recipient's own "chat" push switch (profile settings); sendPushToUser only checks
  // that SOME push channel is on.
  const chatPushEnabled = user?.notificationSettings?.push?.chat !== false;

  const results = await Promise.allSettled([
    chatPushEnabled ?
      sendPushToUser(recipientId, {
        title: message.title,
        body: message.body,
        data: { conversationId, type },
      }) :
      Promise.resolve(),

    db.collection("users").doc(recipientId).collection("notifications").add({
      title: message.title,
      body: message.body,
      type,
      data: { conversationId, senderId },
      imageUrl: senderPhoto,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.warn("[chat] notification channel failed", {
        channel: ["push", "in-app"][i],
        conversationId,
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });
}
