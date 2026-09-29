import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  bookingDetailHref,
  isTrainerOnlyType,
  normalizeNotification,
  sortNewestFirst,
  type InboxNotification,
} from '@/lib/notifications/inbox';

/**
 * Firestore access for the per-user inbox `users/{uid}/notifications`.
 * firestore.rules: owner may read and update (mark read); only Cloud Functions create/delete.
 */

export const INBOX_LIMIT = 50;
const BATCH_MAX = 450;

function inboxCollection(uid: string) {
  return collection(db, 'users', uid, 'notifications');
}

/** Live view of the newest {@link INBOX_LIMIT} notifications. Returns the unsubscribe. */
export function subscribeToInbox(
  uid: string,
  onChange: (items: InboxNotification[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(inboxCollection(uid), orderBy('createdAt', 'desc'), limit(INBOX_LIMIT));
  return onSnapshot(
    q,
    // estimate: a just-written doc has a pending serverTimestamp; show its local time.
    (snap) =>
      onChange(
        sortNewestFirst(
          snap.docs.map((d) =>
            normalizeNotification(d.id, d.data({ serverTimestamps: 'estimate' }))
          )
        )
      ),
    (error) => onError?.(error)
  );
}

export async function setNotificationRead(
  uid: string,
  notificationId: string,
  isRead: boolean
): Promise<void> {
  await updateDoc(doc(inboxCollection(uid), notificationId), {
    isRead,
    readAt: isRead ? serverTimestamp() : null,
  });
}

/**
 * Marks every unread notification read: the server-side unread set (isRead == false, beyond
 * the visible 50 too) plus any loaded legacy docs that only carry `read: false`.
 */
export async function markAllInboxRead(uid: string, loadedUnreadIds: string[] = []): Promise<number> {
  const unreadSnap = await getDocs(query(inboxCollection(uid), where('isRead', '==', false)));
  const ids = new Set<string>(loadedUnreadIds);
  unreadSnap.docs.forEach((d) => ids.add(d.id));

  const all = [...ids];
  for (let i = 0; i < all.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const id of all.slice(i, i + BATCH_MAX)) {
      batch.update(doc(inboxCollection(uid), id), { isRead: true, readAt: serverTimestamp() });
    }
    await batch.commit();
  }
  return all.length;
}

/**
 * Where tapping a notification should go, or null when it has no destination.
 * A booking notification opens the trainer's detail page when the viewer is the booking's
 * trainer, the customer's otherwise — decided from the booking itself, because `rescheduled`
 * and similar events go to both sides.
 */
export async function resolveNotificationHref(
  uid: string,
  notification: InboxNotification
): Promise<string | null> {
  const { bookingId } = notification;
  if (!bookingId) return null;

  try {
    const snap = await getDoc(doc(db, 'bookings', bookingId));
    if (snap.exists()) {
      return bookingDetailHref(bookingId, snap.get('instructorId') === uid);
    }
  } catch {
    // Unreadable (deleted, or no longer a participant): fall back to the type.
  }
  return bookingDetailHref(bookingId, isTrainerOnlyType(notification.type));
}
