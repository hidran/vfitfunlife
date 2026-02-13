import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppNotificationType = 'booking' | 'message' | 'promo' | 'system';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: AppNotificationType;
  read: boolean;
  timestamp: string;
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    title: 'Promemoria prenotazione',
    body: 'Hai una sessione domani alle 10:00 con Marco Rossi.',
    type: 'booking',
    read: false,
    timestamp: '2026-02-13T09:30:00.000Z',
  },
  {
    id: 'n2',
    title: 'Nuovo messaggio',
    body: 'Il provider ti ha inviato un aggiornamento sulla location.',
    type: 'message',
    read: false,
    timestamp: '2026-02-13T08:05:00.000Z',
  },
  {
    id: 'n3',
    title: 'Bonus referral accreditato',
    body: 'Hai ricevuto 250 punti per un nuovo invito completato.',
    type: 'promo',
    read: true,
    timestamp: '2026-02-12T17:42:00.000Z',
  },
  {
    id: 'n4',
    title: 'Profilo aggiornato',
    body: 'Le impostazioni account sono state salvate correttamente.',
    type: 'system',
    read: true,
    timestamp: '2026-02-12T12:20:00.000Z',
  },
];

interface NotificationStore {
  notifications: AppNotification[];
  markAllAsRead: () => void;
  toggleRead: (id: string) => void;
  resetNotifications: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: INITIAL_NOTIFICATIONS,
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
        }));
      },
      toggleRead: (id: string) => {
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id
              ? { ...notification, read: !notification.read }
              : notification
          ),
        }));
      },
      resetNotifications: () => set({ notifications: INITIAL_NOTIFICATIONS }),
    }),
    {
      name: 'vfit-notifications',
    }
  )
);

