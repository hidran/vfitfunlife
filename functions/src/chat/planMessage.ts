/**
 * Pure decision logic for a newly created chat message — what to write on the conversation
 * and whether the recipient gets notified. Kept free of firebase-admin so it is unit-testable;
 * onMessageCreated.ts is the Firestore plumbing around it.
 */

import { previewText } from "./chatMessages";

/** At most one notification per conversation per recipient in this window. */
export const CHAT_NOTIFY_THROTTLE_MS = 5 * 60 * 1000;

/** Inbox preview length stored on the conversation. */
export const LAST_MESSAGE_PREVIEW_LENGTH = 140;

export interface ConversationState {
  participantIds?: unknown;
  lastMessageAtMillis?: number | null;
  lastSenderId?: string | null;
  /** recipient uid -> millis of the last notification sent to them for this conversation. */
  lastPushAtMillis?: Record<string, number | undefined>;
}

export interface MessageState {
  senderId?: unknown;
  text?: unknown;
  createdAtMillis?: number | null;
}

export type MessagePlan =
  | { kind: "skip"; reason: string }
  | {
      kind: "apply";
      recipientId: string;
      /** Whether to overwrite lastMessage/lastMessageAt/lastSenderId (not for a late, older message). */
      updatePreview: boolean;
      preview: string;
      /** Whether to notify (in-app + push) now; false inside the throttle window. */
      notify: boolean;
    };

export function planChatMessage(
  conversation: ConversationState,
  message: MessageState,
  nowMillis: number
): MessagePlan {
  const ids = Array.isArray(conversation.participantIds) ?
    conversation.participantIds.filter((v): v is string => typeof v === "string") :
    [];
  if (ids.length !== 2) return { kind: "skip", reason: "malformed participantIds" };

  const senderId = typeof message.senderId === "string" ? message.senderId : "";
  if (!ids.includes(senderId)) return { kind: "skip", reason: "sender is not a participant" };

  const text = typeof message.text === "string" ? message.text : "";
  if (!text.trim()) return { kind: "skip", reason: "empty message" };

  const recipientId = ids[0] === senderId ? ids[1] : ids[0];
  const createdAt = message.createdAtMillis ?? nowMillis;

  // Triggers are not ordered: a delayed older message must not replace a newer preview.
  // `>=`: the conversation's lastMessageAt starts equal to its first message's createdAt
  // (same batch, same request.time).
  const updatePreview =
    conversation.lastMessageAtMillis == null ||
    conversation.lastSenderId == null ||
    createdAt >= conversation.lastMessageAtMillis;

  const lastPush = conversation.lastPushAtMillis?.[recipientId];
  const notify = lastPush == null || nowMillis - lastPush >= CHAT_NOTIFY_THROTTLE_MS;

  return {
    kind: "apply",
    recipientId,
    updatePreview,
    preview: previewText(text, LAST_MESSAGE_PREVIEW_LENGTH),
    notify,
  };
}
