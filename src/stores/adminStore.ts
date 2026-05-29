import { create } from "zustand";
import {
  AdminDashboardStats,
  UserFilters,
  ProviderFilters,
  BookingFilters,
  LogFilters,
  PlatformSettings,
  SystemLog,
  UserType,
  UserTypeData,
  VerificationData,
  AnnouncementData,
  AdminUser,
  AdminProvider,
  AdminTransaction,
  PayoutRequest,
  BulkActionResult,
} from "@/types/admin";
import { Booking, User, UserRole } from "@/types/firebase";
import {
  getAdminDashboardStats,
  getUsers,
  updateUserRole,
  suspendUser,
  activateUser,
  getProviders,
  verifyProvider,
  rejectProvider,
  getBookings,
  cancelBookingAdmin,
  processRefund,
  getPlatformSettings,
  updatePlatformSettings,
  getSystemLogs,
  createUserType,
  updateUserType,
  deleteUserType,
  createAnnouncement,
  bulkUpdateUsers,
  bulkUpdateUserRole,
  exportData,
  getPendingVerifications,
  getPayoutRequests,
  processPayout,
  getAdminTransactions,
} from "@/lib/firebase/admin";

interface AdminState {
  // Data
  dashboardStats: AdminDashboardStats | null;
  users: AdminUser[];
  providers: AdminProvider[];
  bookings: Booking[];
  pendingVerifications: AdminProvider[];
  systemLogs: SystemLog[];
  platformSettings: PlatformSettings | null;
  userTypes: UserType[];
  transactions: AdminTransaction[];
  payoutRequests: PayoutRequest[];

  // Loading states
  isLoadingStats: boolean;
  isLoadingUsers: boolean;
  isLoadingProviders: boolean;
  isLoadingBookings: boolean;
  isLoadingLogs: boolean;
  isLoadingSettings: boolean;
  isLoadingUserTypes: boolean;
  isLoadingTransactions: boolean;
  isLoadingPayouts: boolean;

  // Error states
  error: string | null;

  // Pagination
  usersTotal: number;
  providersTotal: number;
  bookingsTotal: number;
  logsTotal: number;

  // Actions
  fetchDashboardStats: () => Promise<void>;
  fetchUsers: (filters?: UserFilters) => Promise<void>;
  updateUserRoleAction: (userId: string, role: UserRole) => Promise<void>;
  suspendUserAction: (userId: string, reason: string) => Promise<void>;
  activateUserAction: (userId: string) => Promise<void>;
  fetchProviders: (filters?: ProviderFilters) => Promise<void>;
  verifyProviderAction: (providerId: string, data: VerificationData) => Promise<void>;
  rejectProviderAction: (providerId: string, reason: string) => Promise<void>;
  fetchPendingVerifications: () => Promise<void>;
  fetchBookings: (filters?: BookingFilters) => Promise<void>;
  cancelBookingAction: (bookingId: string, reason: string) => Promise<void>;
  processRefundAction: (bookingId: string, amount: number) => Promise<void>;
  fetchSystemLogs: (filters?: LogFilters) => Promise<void>;
  fetchPlatformSettings: () => Promise<void>;
  updatePlatformSettingsAction: (settings: PlatformSettings) => Promise<void>;
  fetchUserTypes: () => Promise<void>;
  createUserTypeAction: (data: UserTypeData) => Promise<string>;
  updateUserTypeAction: (id: string, data: UserTypeData) => Promise<void>;
  deleteUserTypeAction: (id: string) => Promise<void>;
  createAnnouncementAction: (data: AnnouncementData) => Promise<void>;
  bulkUpdateUsersAction: (userIds: string[], action: "activate" | "suspend" | "delete") => Promise<BulkActionResult>;
  bulkUpdateUserRoleAction: (userIds: string[], role: UserRole) => Promise<BulkActionResult>;
  exportDataAction: (collection: string, options: { format: "csv" | "excel"; filters?: Record<string, any> }) => Promise<string>;
  fetchTransactions: (filters?: { dateFrom?: Date; dateTo?: Date; status?: string }) => Promise<void>;
  fetchPayoutRequests: (status?: string) => Promise<void>;
  processPayoutAction: (payoutId: string, status: "completed" | "rejected", notes?: string) => Promise<void>;

  // Helpers
  clearError: () => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  // Initial state
  dashboardStats: null,
  users: [],
  providers: [],
  bookings: [],
  pendingVerifications: [],
  systemLogs: [],
  platformSettings: null,
  userTypes: [],
  transactions: [],
  payoutRequests: [],

  isLoadingStats: false,
  isLoadingUsers: false,
  isLoadingProviders: false,
  isLoadingBookings: false,
  isLoadingLogs: false,
  isLoadingSettings: false,
  isLoadingUserTypes: false,
  isLoadingTransactions: false,
  isLoadingPayouts: false,

  error: null,

  usersTotal: 0,
  providersTotal: 0,
  bookingsTotal: 0,
  logsTotal: 0,

  // Fetch dashboard stats
  fetchDashboardStats: async () => {
    set({ isLoadingStats: true, error: null });
    try {
      const stats = await getAdminDashboardStats();
      set({ dashboardStats: stats, isLoadingStats: false });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch dashboard stats", isLoadingStats: false });
    }
  },

  // Fetch users
  fetchUsers: async (filters?: UserFilters) => {
    set({ isLoadingUsers: true, error: null });
    try {
      const result = await getUsers(filters || {});
      set({ 
        users: result.users, 
        usersTotal: result.total,
        isLoadingUsers: false 
      });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch users", isLoadingUsers: false });
    }
  },

  // Update user role
  updateUserRoleAction: async (userId: string, role: UserRole) => {
    set({ error: null });
    try {
      await updateUserRole(userId, role);
      // Refresh users list
      await get().fetchUsers();
    } catch (error: any) {
      set({ error: error.message || "Failed to update user role" });
      throw error;
    }
  },

  // Suspend user
  suspendUserAction: async (userId: string, reason: string) => {
    set({ error: null });
    try {
      await suspendUser(userId, reason);
      // Update user in list
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, status: "suspended" } : u
        ) as AdminUser[],
      }));
    } catch (error: any) {
      set({ error: error.message || "Failed to suspend user" });
      throw error;
    }
  },

  // Activate user
  activateUserAction: async (userId: string) => {
    set({ error: null });
    try {
      await activateUser(userId);
      // Update user in list
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, status: "active" } : u
        ) as AdminUser[],
      }));
    } catch (error: any) {
      set({ error: error.message || "Failed to activate user" });
      throw error;
    }
  },

  // Fetch providers
  fetchProviders: async (filters?: ProviderFilters) => {
    set({ isLoadingProviders: true, error: null });
    try {
      const result = await getProviders(filters || {});
      set({ 
        providers: result.providers, 
        providersTotal: result.total,
        isLoadingProviders: false 
      });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch providers", isLoadingProviders: false });
    }
  },

  // Verify provider
  verifyProviderAction: async (providerId: string, data: VerificationData) => {
    set({ error: null });
    try {
      await verifyProvider(providerId, data);
      // Refresh providers and pending verifications
      await get().fetchProviders();
      await get().fetchPendingVerifications();
    } catch (error: any) {
      set({ error: error.message || "Failed to verify provider" });
      throw error;
    }
  },

  // Reject provider
  rejectProviderAction: async (providerId: string, reason: string) => {
    set({ error: null });
    try {
      await rejectProvider(providerId, reason);
      // Refresh providers and pending verifications
      await get().fetchProviders();
      await get().fetchPendingVerifications();
    } catch (error: any) {
      set({ error: error.message || "Failed to reject provider" });
      throw error;
    }
  },

  // Fetch pending verifications
  fetchPendingVerifications: async () => {
    try {
      const providers = await getPendingVerifications();
      set({ pendingVerifications: providers });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch pending verifications" });
    }
  },

  // Fetch bookings
  fetchBookings: async (filters?: BookingFilters) => {
    set({ isLoadingBookings: true, error: null });
    try {
      const result = await getBookings(filters || {});
      set({ 
        bookings: result.bookings, 
        bookingsTotal: result.total,
        isLoadingBookings: false 
      });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch bookings", isLoadingBookings: false });
    }
  },

  // Cancel booking
  cancelBookingAction: async (bookingId: string, reason: string) => {
    set({ error: null });
    try {
      await cancelBookingAdmin(bookingId, reason);
      // Refresh bookings
      await get().fetchBookings();
    } catch (error: any) {
      set({ error: error.message || "Failed to cancel booking" });
      throw error;
    }
  },

  // Process refund
  processRefundAction: async (bookingId: string, amount: number) => {
    set({ error: null });
    try {
      await processRefund(bookingId, amount);
      // Refresh bookings
      await get().fetchBookings();
    } catch (error: any) {
      set({ error: error.message || "Failed to process refund" });
      throw error;
    }
  },

  // Fetch system logs
  fetchSystemLogs: async (filters?: LogFilters) => {
    set({ isLoadingLogs: true, error: null });
    try {
      const result = await getSystemLogs(filters || {});
      set({ 
        systemLogs: result.logs, 
        logsTotal: result.total,
        isLoadingLogs: false 
      });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch system logs", isLoadingLogs: false });
    }
  },

  // Fetch platform settings
  fetchPlatformSettings: async () => {
    set({ isLoadingSettings: true, error: null });
    try {
      const settings = await getPlatformSettings();
      set({ platformSettings: settings, isLoadingSettings: false });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch platform settings", isLoadingSettings: false });
    }
  },

  // Update platform settings
  updatePlatformSettingsAction: async (settings: PlatformSettings) => {
    set({ error: null });
    try {
      await updatePlatformSettings(settings);
      set({ platformSettings: settings });
    } catch (error: any) {
      set({ error: error.message || "Failed to update platform settings" });
      throw error;
    }
  },

  // Fetch user types
  fetchUserTypes: async () => {
    set({ isLoadingUserTypes: true, error: null });
    try {
      // This would call a Firebase function
      // For now, mock data
      set({ isLoadingUserTypes: false });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch user types", isLoadingUserTypes: false });
    }
  },

  // Create user type
  createUserTypeAction: async (data: UserTypeData) => {
    set({ error: null });
    try {
      const id = await createUserType(data);
      await get().fetchUserTypes();
      return id;
    } catch (error: any) {
      set({ error: error.message || "Failed to create user type" });
      throw error;
    }
  },

  // Update user type
  updateUserTypeAction: async (id: string, data: UserTypeData) => {
    set({ error: null });
    try {
      await updateUserType(id, data);
      await get().fetchUserTypes();
    } catch (error: any) {
      set({ error: error.message || "Failed to update user type" });
      throw error;
    }
  },

  // Delete user type
  deleteUserTypeAction: async (id: string) => {
    set({ error: null });
    try {
      await deleteUserType(id);
      await get().fetchUserTypes();
    } catch (error: any) {
      set({ error: error.message || "Failed to delete user type" });
      throw error;
    }
  },

  // Create announcement
  createAnnouncementAction: async (data: AnnouncementData) => {
    set({ error: null });
    try {
      await createAnnouncement(data);
    } catch (error: any) {
      set({ error: error.message || "Failed to create announcement" });
      throw error;
    }
  },

  // Bulk update users
  bulkUpdateUsersAction: async (
    userIds: string[],
    action: "activate" | "suspend" | "delete"
  ): Promise<BulkActionResult> => {
    set({ error: null });
    try {
      const result = await bulkUpdateUsers(userIds, action);
      await get().fetchUsers();
      return result;
    } catch (error: any) {
      set({ error: error.message || "Failed to bulk update users" });
      throw error;
    }
  },

  // Bulk update user role
  bulkUpdateUserRoleAction: async (
    userIds: string[],
    role: UserRole
  ): Promise<BulkActionResult> => {
    set({ error: null });
    try {
      const result = await bulkUpdateUserRole(userIds, role);
      await get().fetchUsers();
      return result;
    } catch (error: any) {
      set({ error: error.message || "Failed to bulk update user roles" });
      throw error;
    }
  },

  // Export data
  exportDataAction: async (
    collection: string,
    options: { format: "csv" | "excel"; filters?: Record<string, any> }
  ): Promise<string> => {
    set({ error: null });
    try {
      const downloadUrl = await exportData(collection, options);
      return downloadUrl;
    } catch (error: any) {
      set({ error: error.message || "Failed to export data" });
      throw error;
    }
  },

  // Fetch transactions
  fetchTransactions: async (filters?: { dateFrom?: Date; dateTo?: Date; status?: string }) => {
    set({ isLoadingTransactions: true, error: null });
    try {
      const transactions = await getAdminTransactions(filters || {});
      set({ transactions, isLoadingTransactions: false });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch transactions", isLoadingTransactions: false });
    }
  },

  // Fetch payout requests
  fetchPayoutRequests: async (status?: string) => {
    set({ isLoadingPayouts: true, error: null });
    try {
      const payouts = await getPayoutRequests(status);
      set({ payoutRequests: payouts, isLoadingPayouts: false });
    } catch (error: any) {
      set({ error: error.message || "Failed to fetch payout requests", isLoadingPayouts: false });
    }
  },

  // Process payout
  processPayoutAction: async (payoutId: string, status: "completed" | "rejected", notes?: string) => {
    set({ error: null });
    try {
      await processPayout(payoutId, status, notes);
      await get().fetchPayoutRequests();
    } catch (error: any) {
      set({ error: error.message || "Failed to process payout" });
      throw error;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
