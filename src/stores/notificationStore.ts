import { create } from 'zustand';
import { countUnread, type InboxNotification } from '@/lib/notifications/inbox';

export type { InboxNotification, InboxCategory } from '@/lib/notifications/inbox';

/**
 * Realtime notification inbox for the signed-in user (client and provider alike — both read
 * `users/{uid}/notifications`). Fed by one onSnapshot listener started from the (main) layout
 * via {@link startNotificationInbox}; the Header badge and /notifications read the same state.
 */
export type InboxStatus = 'idle' | 'loading' | 'ready' | 'error';

interface NotificationStore {
  uid: string | null;
  status: InboxStatus;
  notifications: InboxNotification[];
  unreadCount: number;
  markRead: (id: string, isRead?: boolean) => Promise<void>;
  markAllRead: () => Promise<number>;
}

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  uid: null,
  status: 'idle',
  notifications: [],
  unreadCount: 0,

  markRead: async (id, isRead = true) => {
    const { uid, notifications } = get();
    if (!uid) return;
    const current = notifications.find((n) => n.id === id);
    if (current && current.isRead === isRead) return;
    // The snapshot listener applies local writes immediately (latency compensation), so no
    // manual optimistic update is needed.
    const { setNotificationRead } = await import('@/lib/firebase/notifications');
    await setNotificationRead(uid, id, isRead);
  },

  markAllRead: async () => {
    const { uid, notifications } = get();
    if (!uid) return 0;
    const { markAllInboxRead } = await import('@/lib/firebase/notifications');
    return markAllInboxRead(
      uid,
      notifications.filter((n) => !n.isRead).map((n) => n.id)
    );
  },
}));

let activeUid: string | null = null;
let unsubscribe: (() => void) | null = null;
let refCount = 0;

/** The old mock store persisted fake notifications under this key; drop them once. */
function dropLegacyMockCache() {
  try {
    globalThis.localStorage?.removeItem('vfit-notifications');
  } catch {
    // storage unavailable (private mode, SSR): nothing to clean
  }
}

function reset() {
  useNotificationStore.setState({ uid: null, status: 'idle', notifications: [], unreadCount: 0 });
}

/**
 * Starts (or joins) the inbox listener for `uid`. Returns a release function; the listener
 * stops when the last holder releases or a different uid starts one.
 */
export function startNotificationInbox(uid: string): () => void {
  if (activeUid !== uid) {
    dropLegacyMockCache();
    unsubscribe?.();
    unsubscribe = null;
    refCount = 0;
    activeUid = uid;
    useNotificationStore.setState({ uid, status: 'loading', notifications: [], unreadCount: 0 });

    let cancelled = false;
    const cancelPending = () => {
      cancelled = true;
    };
    unsubscribe = cancelPending;

    void import('@/lib/firebase/notifications').then(({ subscribeToInbox }) => {
      if (cancelled || activeUid !== uid) return;
      unsubscribe = subscribeToInbox(
        uid,
        (items) => {
          if (activeUid !== uid) return;
          useNotificationStore.setState({
            status: 'ready',
            notifications: items,
            unreadCount: countUnread(items),
          });
        },
        (error) => {
          if (activeUid !== uid) return;
          console.error('[notifications] inbox listener failed', error);
          useNotificationStore.setState({ status: 'error' });
        }
      );
    });
  }

  refCount++;
  let released = false;
  return () => {
    if (released || activeUid !== uid) return;
    released = true;
    refCount--;
    if (refCount <= 0) {
      unsubscribe?.();
      unsubscribe = null;
      activeUid = null;
      refCount = 0;
      reset();
    }
  };
}
