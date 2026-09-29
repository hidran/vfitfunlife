import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeNotification, type InboxNotification } from '@/lib/notifications/inbox';

const listeners = new Map<string, (items: InboxNotification[]) => void>();
const errorHandlers = new Map<string, (e: Error) => void>();
const unsubscribes = new Map<string, ReturnType<typeof vi.fn>>();
const setNotificationRead = vi.fn(async () => {});
const markAllInboxRead = vi.fn(async (_uid: string, ids: string[]) => ids.length);

vi.mock('@/lib/firebase/notifications', () => ({
  subscribeToInbox: (uid: string, onChange: (i: InboxNotification[]) => void, onError: (e: Error) => void) => {
    listeners.set(uid, onChange);
    errorHandlers.set(uid, onError);
    const unsub = vi.fn();
    unsubscribes.set(uid, unsub);
    return unsub;
  },
  setNotificationRead: (...args: unknown[]) => setNotificationRead(...(args as [])),
  markAllInboxRead: (uid: string, ids: string[]) => markAllInboxRead(uid, ids),
}));

import { startNotificationInbox, useNotificationStore } from './notificationStore';

const flush = (uid: string) =>
  vi.waitFor(() => {
    if (!listeners.has(uid)) throw new Error('not subscribed');
  });

const items = [
  normalizeNotification('n1', { title: 'A', isRead: false, data: { bookingId: 'b1' } }),
  normalizeNotification('n2', { title: 'B', isRead: true }),
  normalizeNotification('n3', { title: 'C', read: false }),
];

describe('notificationStore', () => {
  beforeEach(() => {
    listeners.clear();
    unsubscribes.clear();
    setNotificationRead.mockClear();
    markAllInboxRead.mockClear();
  });

  it('subscribes per uid, exposes items and the unread count, and cleans up on release', async () => {
    const release = startNotificationInbox('u1');
    expect(useNotificationStore.getState()).toMatchObject({ uid: 'u1', status: 'loading' });
    await flush('u1');

    listeners.get('u1')!(items);
    expect(useNotificationStore.getState()).toMatchObject({ status: 'ready', unreadCount: 2 });
    expect(useNotificationStore.getState().notifications).toHaveLength(3);

    release();
    expect(unsubscribes.get('u1')).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState()).toMatchObject({
      uid: null,
      status: 'idle',
      notifications: [],
      unreadCount: 0,
    });
  });

  it('switching user drops the previous listener', async () => {
    const releaseA = startNotificationInbox('a');
    await flush('a');
    const releaseB = startNotificationInbox('b');
    await flush('b');
    expect(unsubscribes.get('a')).toHaveBeenCalledTimes(1);
    releaseA(); // stale release must not tear down b
    expect(unsubscribes.get('b')).not.toHaveBeenCalled();
    releaseB();
    expect(unsubscribes.get('b')).toHaveBeenCalledTimes(1);
  });

  it('reports listener errors', async () => {
    const release = startNotificationInbox('err');
    await flush('err');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandlers.get('err')!(new Error('permission-denied'));
    expect(useNotificationStore.getState().status).toBe('error');
    spy.mockRestore();
    release();
  });

  it('markRead / markAllRead write through for the signed-in uid', async () => {
    const release = startNotificationInbox('u2');
    await flush('u2');
    listeners.get('u2')!(items);

    await useNotificationStore.getState().markRead('n1');
    expect(setNotificationRead).toHaveBeenCalledWith('u2', 'n1', true);

    await useNotificationStore.getState().markRead('n2'); // already read: no write
    expect(setNotificationRead).toHaveBeenCalledTimes(1);

    const count = await useNotificationStore.getState().markAllRead();
    expect(markAllInboxRead).toHaveBeenCalledWith('u2', ['n1', 'n3']);
    expect(count).toBe(2);
    release();
  });
});
