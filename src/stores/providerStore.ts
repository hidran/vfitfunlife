import { create } from 'zustand';
import type { PaymentConfirmationMethod } from '@/types/firebase';
import {
  getProviderDashboardStats,
  getProviderBookings,
  getProviderSchedule,
  updateAvailability,
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
  getProviderServices,
  updateService,
  createService,
  deleteService,
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
  ProviderService,
  BookingFilters,
  ProviderBooking,
  ProviderNotification,
  AvailabilitySettings,
  ActivityItem,
} from '@/types/provider';
import { useAuthStore } from '@/stores/authStore';

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
  services: ProviderService[];
  notifications: ProviderNotification[];
  activities: ActivityItem[];
  availability: AvailabilitySettings | null;

  // Loading states
  isLoading: boolean;
  isLoadingBookings: boolean;
  isLoadingSchedule: boolean;
  isLoadingEarnings: boolean;
  isLoadingClients: boolean;
  isLoadingServices: boolean;

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

  // Actions - Services
  fetchServices: () => Promise<void>;
  updateService: (serviceId: string, data: Partial<ProviderService>) => Promise<void>;
  createService: (data: Omit<ProviderService, 'id' | 'createdAt' | 'updatedAt' | 'bookingCount' | 'revenue'>) => Promise<string>;
  deleteService: (serviceId: string) => Promise<void>;

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
  services: [],
  notifications: [],
  activities: [],
  availability: null,

  isLoading: false,
  isLoadingBookings: false,
  isLoadingSchedule: false,
  isLoadingEarnings: false,
  isLoadingClients: false,
  isLoadingServices: false,

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
    set({ isLoading: true, error: null });
    try {
      // This would fetch from Firebase
      // For now, return default availability
      const defaultAvailability: AvailabilitySettings = {
        weeklySchedule: {
          monday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
          tuesday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
          wednesday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
          thursday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
          friday: { isAvailable: true, slots: [{ start: '09:00', end: '17:00' }] },
          saturday: { isAvailable: false, slots: [] },
          sunday: { isAvailable: false, slots: [] },
        },
        dateOverrides: [],
        bufferMinutes: 15,
        minAdvanceNoticeHours: 24,
        maxBookingsPerDay: 8,
        timezone: 'Europe/Rome',
      };
      set({ availability: defaultAvailability, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch availability', isLoading: false });
    }
  },

  updateAvailability: async (settings: AvailabilitySettings) => {
    set({ isLoading: true, error: null });
    try {
      await updateAvailability(settings);
      set({ availability: settings, isLoading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to update availability', isLoading: false });
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

  // Services
  fetchServices: async () => {
    set({ isLoadingServices: true, error: null });
    try {
      const services = await getProviderServices();
      set({ services, isLoadingServices: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch services', isLoadingServices: false });
    }
  },

  updateService: async (serviceId: string, data: Partial<ProviderService>) => {
    try {
      await updateService(serviceId, data);
      // Refresh services
      await get().fetchServices();
    } catch (error: any) {
      set({ error: error.message || 'Failed to update service' });
    }
  },

  createService: async (data: Omit<ProviderService, 'id' | 'createdAt' | 'updatedAt' | 'bookingCount' | 'revenue'>) => {
    try {
      const serviceId = await createService(data);
      // Refresh services
      await get().fetchServices();
      return serviceId;
    } catch (error: any) {
      set({ error: error.message || 'Failed to create service' });
      throw error;
    }
  },

  deleteService: async (serviceId: string) => {
    try {
      await deleteService(serviceId);
      // Refresh services
      await get().fetchServices();
    } catch (error: any) {
      set({ error: error.message || 'Failed to delete service' });
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
