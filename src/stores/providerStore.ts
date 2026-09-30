import { create } from 'zustand';
import type { BookingStatus, PaymentConfirmationMethod } from '@/types/firebase';
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

/** fetchDashboardStats skips a refetch inside this window (ms) unless forced. */
const DASHBOARD_STATS_CACHE_MS = 60_000;

interface ProviderState {
  // Data
  dashboardStats: DashboardStats | null;
  /** When dashboardStats was last fetched successfully (Date.now()), or null if never. */
  dashboardStatsFetchedAt: number | null;
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
  /** The filters of the last fetchBookings, so a refresh after an action keeps the tab. */
  lastBookingFilters: BookingFilters | undefined;

  // Actions - Dashboard
  /** `force: true` bypasses the 60s cache (e.g. a manual refresh control). */
  fetchDashboardStats: (force?: boolean) => Promise<void>;

  // Actions - Bookings
  fetchBookings: (filters?: BookingFilters) => Promise<void>;
  /**
   * The booking actions resolve true on success and false on failure (the message lands in
   * bookingError), and on success update the booking's status in place before refetching,
   * so the row reflects the change the moment the server confirms it.
   */
  confirmBooking: (id: string) => Promise<boolean>;
  declineBooking: (id: string, note?: string) => Promise<boolean>;
  completeBooking: (id: string) => Promise<boolean>;
  markBookingNoShow: (id: string) => Promise<boolean>;
  cancelBooking: (id: string, reason?: string) => Promise<boolean>;
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

type StoreSet = (partial: Partial<ProviderState> | ((s: ProviderState) => Partial<ProviderState>)) => void;

/**
 * One booking transition: call the server, then show the new status on the row at once and
 * refresh the list quietly (no loading spinner, same filters as the tab on screen), so the
 * table neither blanks out nor keeps the old status until a reload.
 */
async function runBookingAction(
  set: StoreSet,
  get: () => ProviderState,
  id: string,
  nextStatus: BookingStatus,
  call: () => Promise<void>,
  fallbackError: string,
): Promise<boolean> {
  set({ bookingError: null });
  try {
    await call();
  } catch (error: any) {
    set({ bookingError: error?.message || fallbackError });
    return false;
  }
  set((s) => ({ bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: nextStatus } : b)) }));
  try {
    set({ bookings: await getProviderBookings(get().lastBookingFilters) });
  } catch {
    // The transition itself succeeded; a failed refresh just leaves the in-place update.
  }
  return true;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  // Initial state
  dashboardStats: null,
  dashboardStatsFetchedAt: null,
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
  lastBookingFilters: undefined,

  // Dashboard
  fetchDashboardStats: async (force = false) => {
    // The dashboard mounts fresh on every visit to /provider/dashboard and re-runs this on
    // every mount; without this the provider doc read plus five booking/client
    // queries/aggregates fired again each time, even seconds apart. `dashboardStats` already
    // being set is part of the guard so a failed first fetch (stats still null) always
    // retries rather than getting stuck behind the cache window.
    const { dashboardStats, dashboardStatsFetchedAt } = get();
    if (
      !force &&
      dashboardStats &&
      dashboardStatsFetchedAt !== null &&
      Date.now() - dashboardStatsFetchedAt < DASHBOARD_STATS_CACHE_MS
    ) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const stats = await getProviderDashboardStats();
      set({ dashboardStats: stats, dashboardStatsFetchedAt: Date.now(), isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch dashboard stats', isLoading: false });
    }
  },

  // Bookings
  fetchBookings: async (filters?: BookingFilters) => {
    set({ isLoadingBookings: true, bookingError: null, lastBookingFilters: filters });
    try {
      const bookings = await getProviderBookings(filters);
      set({ bookings, isLoadingBookings: false });
    } catch (error: any) {
      set({ bookingError: error.message || 'Failed to fetch bookings', isLoadingBookings: false });
    }
  },

  confirmBooking: (id: string) =>
    runBookingAction(set, get, id, 'accepted', () => confirmBooking(id), 'Failed to confirm booking'),

  completeBooking: (id: string) =>
    runBookingAction(set, get, id, 'completed', () => completeBooking(id), 'Failed to complete booking'),

  cancelBooking: (id: string, reason?: string) =>
    runBookingAction(set, get, id, 'cancelled_by_trainer', () => cancelBooking(id, reason), 'Failed to cancel booking'),

  declineBooking: (id: string, note?: string) =>
    runBookingAction(set, get, id, 'declined', () => declineBooking(id, note), 'Failed to decline booking'),

  markBookingNoShow: (id: string) =>
    runBookingAction(set, get, id, 'no_show', () => markBookingNoShow(id), 'Failed to record no-show'),

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
    if (!uid) {
      // The provider layout mounts its children (and this effect) before auth restores on a
      // hard reload or deep link. A bare return here left the page spinning forever, waiting
      // for a fetch that was never retried once the uid became available.
      set({ isLoading: false, availability: null, availabilityLoadError: 'not_signed_in' });
      return;
    }
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
