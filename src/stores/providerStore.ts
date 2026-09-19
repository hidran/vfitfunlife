import { create } from 'zustand';
import type { PaymentConfirmationMethod } from '@/types/firebase';
import {
  getProviderDashboardStats,
  getProviderBookings,
  getProviderSchedule,
  confirmBooking,
  declineBooking,
  completeBooking,
  markBookingNoShow,
  cancelBooking,
  confirmBookingPayment,
  getProviderEarnings,
  getProviderClients,
  getClientDetails,
  addClientNote,
  requestWithdrawal,
  getProviderNotifications,
  markNotificationAsRead,
} from '@/lib/firebase/provider';
import {
  DashboardStats,
  ScheduleEvent,
  EarningsData,
  EarningsFilters,
  ProviderClient,
  ClientBookingHistory,
  ClientNote,
  BookingFilters,
  ProviderBooking,
  ProviderNotification,
  AvailabilitySettings,
  ActivityItem,
} from '@/types/provider';
import { useAuthStore } from '@/stores/authStore';
import { fetchMyAvailability, saveMyAvailability } from '@/lib/firebase/availability';
import { savedOverrides, toSettings, toUpdate, type OverrideDoc } from '@/lib/availability/adapter';

interface ProviderState {
  // Data
  dashboardStats: DashboardStats | null;
  bookings: ProviderBooking[];
  schedule: ScheduleEvent[];
  earnings: EarningsData | null;
  clients: ProviderClient[];
  currentClient: ProviderClient | null;
  clientBookingHistory: ClientBookingHistory[];
  clientNotes: ClientNote[];
  notifications: ProviderNotification[];
  activities: ActivityItem[];
  availability: AvailabilitySettings | null;
  /** Bumped on every load. AvailabilityEditor copies its props once, so it is keyed on this. */
  availabilityVersion: number;
  availabilityLoadError: string | null;
  /** The date exceptions as last loaded or saved — what the next save diffs against. */
  loadedOverrides: OverrideDoc[];

  // Loading states
  isLoading: boolean;
  isLoadingBookings: boolean;
  isLoadingSchedule: boolean;
  isLoadingEarnings: boolean;
  isLoadingClients: boolean;

  // Error states
  error: string | null;
  bookingError: string | null;

  // Actions - Dashboard
  fetchDashboardStats: () => Promise<void>;

  // Actions - Bookings
  fetchBookings: (filters?: BookingFilters) => Promise<void>;
  confirmBooking: (id: string) => Promise<void>;
  declineBooking: (id: string, note?: string) => Promise<void>;
  completeBooking: (id: string) => Promise<void>;
  markBookingNoShow: (id: string) => Promise<void>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  confirmBookingPayment: (
    id: string,
    method: PaymentConfirmationMethod,
    amount: number,
  ) => Promise<void>;

  // Actions - Schedule
  fetchSchedule: (start: Date, end: Date) => Promise<void>;

  // Actions - Availability
  fetchAvailability: () => Promise<void>;
  updateAvailability: (settings: AvailabilitySettings) => Promise<void>;

  // Actions - Earnings
  fetchEarnings: (filters?: EarningsFilters) => Promise<void>;
  requestWithdrawal: (amount: number) => Promise<void>;

  // Actions - Clients
  fetchClients: () => Promise<void>;
  fetchClientDetails: (clientId: string) => Promise<void>;
  addClientNote: (clientId: string, note: string) => Promise<void>;

  // Actions - Notifications
  fetchNotifications: () => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;

  // Actions - Activities
  fetchActivities: (limit?: number) => Promise<void>;

  // Utility
  clearError: () => void;
  clearBookingError: () => void;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  // Initial state
  dashboardStats: null,
  bookings: [],
  schedule: [],
  earnings: null,
  clients: [],
  currentClient: null,
  clientBookingHistory: [],
  clientNotes: [],
  notifications: [],
  activities: [],
  availability: null,
  availabilityVersion: 0,
  availabilityLoadError: null,
  loadedOverrides: [],

  isLoading: false,
  isLoadingBookings: false,
  isLoadingSchedule: false,
  isLoadingEarnings: false,
  isLoadingClients: false,

  error: null,
  bookingError: null,

  // Dashboard
  fetchDashboardStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const stats = await getProviderDashboardStats();
      set({ dashboardStats: stats, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch dashboard stats', isLoading: false });
    }
  },

  // Bookings
  fetchBookings: async (filters?: BookingFilters) => {
    set({ isLoadingBookings: true, bookingError: null });
    try {
      const bookings = await getProviderBookings(filters);
      set({ bookings, isLoadingBookings: false });
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to fetch bookings', isLoadingBookings: false });
    }
  },

  confirmBooking: async (id: string) => {
    try {
      await confirmBooking(id);
      // Refresh bookings
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to confirm booking' });
    }
  },

  completeBooking: async (id: string) => {
    try {
      await completeBooking(id);
      // Refresh bookings
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to complete booking' });
    }
  },

  cancelBooking: async (id: string, reason?: string) => {
    try {
      await cancelBooking(id, reason);
      // Refresh bookings
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to cancel booking' });
    }
  },

  declineBooking: async (id: string, note?: string) => {
    try {
      await declineBooking(id, note);
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to decline booking' });
    }
  },

  markBookingNoShow: async (id: string) => {
    try {
      await markBookingNoShow(id);
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to record no-show' });
    }
  },

  /** Records a payment the client made off-platform. Rethrows so the sheet can show the error. */
  confirmBookingPayment: async (id, method, amount) => {
    try {
      await confirmBookingPayment(id, method, amount);
      await get().fetchBookings();
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to record payment' });
      throw error;
    }
  },

  // Schedule
  fetchSchedule: async (start: Date, end: Date) => {
    set({ isLoadingSchedule: true, error: null });
    try {
      const schedule = await getProviderSchedule(start, end);
      set({ schedule, isLoadingSchedule: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch schedule', isLoadingSchedule: false });
    }
  },

  // Availability
  fetchAvailability: async () => {
    const uid = useAuthStore.getState().user?.id;
    if (!uid) return;
    set({ isLoading: true, availability: null, availabilityLoadError: null });
    try {
      const stored = await fetchMyAvailability(uid);
      const { settings } = toSettings(stored);
      set((state) => ({
        availability: settings,
        availabilityVersion: state.availabilityVersion + 1,
        loadedOverrides: stored.overrides,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ availabilityLoadError: error.message || 'Failed to fetch availability', isLoading: false });
    }
  },

  /** Saves through updateMyAvailability. Rethrows so the page can say why a save failed. */
  updateAvailability: async (settings: AvailabilitySettings) => {
    set({ isLoading: true });
    try {
      await saveMyAvailability(toUpdate(settings, get().loadedOverrides));
      set({
        availability: settings,
        loadedOverrides: savedOverrides(settings),
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Earnings
  fetchEarnings: async (filters?: EarningsFilters) => {
    set({ isLoadingEarnings: true, error: null });
    try {
      const earnings = await getProviderEarnings(filters);
      set({ earnings, isLoadingEarnings: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch earnings', isLoadingEarnings: false });
    }
  },

  requestWithdrawal: async (amount: number) => {
    try {
      await requestWithdrawal(amount);
      // Refresh earnings after withdrawal request
      await get().fetchEarnings();
    } catch (error: any) {
      set({ error: error.message || 'Failed to request withdrawal' });
    }
  },

  // Clients
  fetchClients: async () => {
    set({ isLoadingClients: true, error: null });
    try {
      const clients = await getProviderClients();
      set({ clients, isLoadingClients: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch clients', isLoadingClients: false });
    }
  },

  fetchClientDetails: async (clientId: string) => {
    set({ isLoading: true, error: null });
    try {
      const role = useAuthStore.getState().user?.role;
      const isAdmin = role === 'admin' || role === 'superadmin';
      const { client, bookingHistory, notes } = await getClientDetails(clientId, isAdmin);
      set({
        currentClient: client,
        clientBookingHistory: bookingHistory, 
        clientNotes: notes, 
        isLoading: false 
      });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch client details', isLoading: false });
    }
  },

  addClientNote: async (clientId: string, note: string) => {
    try {
      await addClientNote(clientId, note);
      // Refresh client details
      await get().fetchClientDetails(clientId);
    } catch (error: any) {
      set({ error: error.message || 'Failed to add note' });
    }
  },

  // Notifications
  fetchNotifications: async () => {
    try {
      const notifications = await getProviderNotifications();
      set({ notifications });
    } catch (error: any) {
      console.error('Failed to fetch notifications:', error);
    }
  },

  markNotificationAsRead: async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      set(state => ({
        notifications: state.notifications.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      }));
    } catch (error: any) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  markAllNotificationsAsRead: async () => {
    try {
      // Mark all as read
      const unreadIds = get().notifications.filter(n => !n.isRead).map(n => n.id);
      await Promise.all(unreadIds.map(id => markNotificationAsRead(id)));
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, isRead: true }))
      }));
    } catch (error: any) {
      console.error('Failed to mark all notifications as read:', error);
    }
  },

  // Activities
  fetchActivities: async (limit: number = 10) => {
    try {
      // This would fetch from Firebase
      // For now, return mock data
      const mockActivities: ActivityItem[] = [];
      set({ activities: mockActivities });
    } catch (error: any) {
      console.error('Failed to fetch activities:', error);
    }
  },

  // Utility
  clearError: () => set({ error: null }),
  clearBookingError: () => set({ bookingError: null }),
}));
