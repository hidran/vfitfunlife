/**
 * Client ↔ trainer chat — Firestore access.
 *
 * Model and write ownership: docs/database-schema.md ("Chat"); rules: firestore.rules
 * (CONVERSATIONS). The client writes only: the conversation doc on first contact (in the same
 * batch as its first message), messages, and its own unread reset. lastMessage / unread /
 * the push throttle belong to the onChatMessageCreated Cloud Function.
 */

import {
  collection,
  doc,
  FieldPath,
  getDoc,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { sortedParticipants } from '@/lib/chat/ids';
import type { ChatMessage, ChatParticipant, Conversation } from '@/types/chat';

const CONVERSATIONS = 'conversations';
const MESSAGES = 'messages';

/** The inbox shows the most recent conversations only. */
const INBOX_LIMIT = 50;
/** A thread loads its newest messages only. */
const THREAD_LIMIT = 200;

function conversationFromSnap(snap: DocumentSnapshot): Conversation {
  const data = snap.data({ serverTimestamps: 'estimate' }) ?? {};
  return {
    id: snap.id,
    participantIds: (data.participantIds ?? []) as [string, string],
    participants: (data.participants ?? {}) as Record<string, ChatParticipant>,
    createdAt: data.createdAt ?? null,
    lastMessageAt: data.lastMessageAt ?? null,
    lastMessage: data.lastMessage ?? null,
    lastSenderId: data.lastSenderId ?? null,
    unread: (data.unread ?? {}) as Record<string, number>,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId : undefined,
  };
}

/** Realtime inbox for `uid`, newest first. */
export function subscribeToConversations(
  uid: string,
  onData: (conversations: Conversation[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  const q = query(
    collection(db, CONVERSATIONS),
    where('participantIds', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc'),
    limit(INBOX_LIMIT),
  );
  return onSnapshot(q, (snap) => onData(snap.docs.map(conversationFromSnap)), onError);
}

/**
 * Realtime conversation doc; `null` while it does not exist yet (no message sent).
 * `committed` is false while the doc exists only as this client's pending create — the
 * messages rule reads the SERVER doc, so a messages listener must wait for a committed one.
 */
export function subscribeToConversation(
  conversationId: string,
  onData: (conversation: Conversation | null, committed: boolean) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, CONVERSATIONS, conversationId),
    { includeMetadataChanges: true },
    (snap) =>
      onData(
        snap.exists() ? conversationFromSnap(snap) : null,
        snap.exists() && !snap.metadata.hasPendingWrites && !snap.metadata.fromCache,
      ),
    onError,
  );
}

/**
 * Realtime messages, oldest first. Includes this client's not-yet-acknowledged writes
 * (Firestore latency compensation) with an estimated createdAt — that is the optimistic
 * send; `pending` marks them.
 */
export function subscribeToMessages(
  conversationId: string,
  onData: (messages: Array<ChatMessage & { pending: boolean }>) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  const q = query(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    orderBy('createdAt', 'asc'),
    limitToLast(THREAD_LIMIT),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            senderId: String(data.senderId ?? ''),
            text: String(data.text ?? ''),
            createdAt: data.createdAt ?? null,
            pending: d.metadata.hasPendingWrites,
          };
        }),
      ),
    onError,
  );
}

/** A fresh message id, so a failed send can be retried without duplicating the message. */
export function newMessageId(conversationId: string): string {
  return doc(collection(db, CONVERSATIONS, conversationId, MESSAGES)).id;
}

export interface NewConversation {
  me: string;
  other: string;
  participants: Record<string, ChatParticipant>;
  bookingId?: string;
}

/**
 * Sends one message. With `create`, the conversation doc is created in the same batch (first
 * contact). If that batch is refused because the other side created the conversation a moment
 * earlier, the message alone is retried once.
 */
export async function sendChatMessage(opts: {
  conversationId: string;
  messageId: string;
  senderId: string;
  text: string;
  create?: NewConversation;
}): Promise<void> {
  const { conversationId, messageId, senderId, text, create } = opts;
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const msgRef = doc(convRef, MESSAGES, messageId);
  const message = { senderId, text, createdAt: serverTimestamp() };

  if (create) {
    const batch = writeBatch(db);
    batch.set(convRef, {
      participantIds: sortedParticipants(create.me, create.other),
      participants: create.participants,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      ...(create.bookingId ? { bookingId: create.bookingId } : {}),
    });
    batch.set(msgRef, message);
    try {
      await batch.commit();
      return;
    } catch (err) {
      const exists = await getDoc(convRef).then((s) => s.exists()).catch(() => false);
      if (!exists) throw err;
      // Created concurrently by the other participant: fall through and send the message only.
    }
  }

  await setDoc(msgRef, message);
}

/** Resets the caller's unread counter (the only counter a client may touch). */
export async function markConversationRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), new FieldPath('unread', uid), 0);
}

/**
 * Best-effort public name/photo of a provider, for a conversation opened without hints.
 * `instructors/{uid}` is the public provider catalog (users/{uid} is owner-only).
 */
export async function fetchPublicParticipant(uid: string): Promise<ChatParticipant | null> {
  try {
    const snap = await getDoc(doc(db, 'instructors', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const name = [data.fullName, data.name, data.displayName].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    return {
      name: name ?? '',
      photoUrl: typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : null,
    };
  } catch {
    return null;
  }
}
