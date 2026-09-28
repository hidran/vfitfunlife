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
  type PageCursors,
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
  /** The filters of the last users fetch, reused by refetches that pass none. */
  usersFilters: UserFilters;
  providersTotal: number;
  /** The filters of the last providers fetch, reused by refetches that pass none. */
  providersFilters: ProviderFilters;
  bookingsTotal: number;
  /** The filters of the last bookings fetch, reused by refetches that pass none. */
  bookingsFilters: BookingFilters;
  logsTotal: number;
  /** The filters of the last system-logs fetch, reused by refetches that pass none. */
  logsFilters: LogFilters;

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
  bulkUpdateUsersAction: (userIds: string[], action: "activate" | "suspend") => Promise<BulkActionResult>;
  bulkUpdateUserRoleAction: (userIds: string[], role: UserRole) => Promise<BulkActionResult>;
  exportDataAction: (collection: string, options: { format: "csv" | "excel"; filters?: Record<string, any> }) => Promise<string>;
  fetchTransactions: (filters?: { dateFrom?: Date; dateTo?: Date; status?: string }) => Promise<void>;
  fetchPayoutRequests: (status?: string) => Promise<void>;
  processPayoutAction: (payoutId: string, status: "completed" | "rejected", notes?: string) => Promise<void>;

  // Helpers
  clearError: () => void;
}

/**
 * Request sequence numbers for the list fetches. Responses can arrive out of order (a broad
 * search typed first may resolve after a narrower one typed later); only the latest request
 * may write the list, so a stale response never overwrites a fresher one.
 */
let usersRequestSeq = 0;
let providersRequestSeq = 0;
let bookingsRequestSeq = 0;
let logsRequestSeq = 0;

/**
 * Page cursors of the users/providers/bookings/logs lists (see PageCursors in lib/firebase/admin): the cursor
 * stack behind next/previous. Kept per filter combination — any filter, search or page-size
 * change starts a fresh stack, since a cursor is only meaningful within the query that
 * produced it. Held outside the reactive state: document snapshots aren't render data.
 */
interface PagingState {
  key: string;
  cursors: PageCursors;
}
let usersPaging: PagingState = { key: "", cursors: new Map() };
let providersPaging: PagingState = { key: "", cursors: new Map() };
let bookingsPaging: PagingState = { key: "", cursors: new Map() };
let logsPaging: PagingState = { key: "", cursors: new Map() };

/** Everything that defines the query except which page of it is shown. */
export function listQueryKey(filters: object): string {
  const { page: _page, ...rest } = filters as { page?: number };
  return JSON.stringify(rest, Object.keys(rest).sort());
}

function pagingFor(current: PagingState, filters: object): PagingState {
  const key = listQueryKey(filters);
  return current.key === key ? current : { key, cursors: new Map() };
}

/** Test hook: forget every cursor. */
export function resetAdminListPaging(): void {
  usersPaging = { key: "", cursors: new Map() };
  providersPaging = { key: "", cursors: new Map() };
  bookingsPaging = { key: "", cursors: new Map() };
  logsPaging = { key: "", cursors: new Map() };
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
  usersFilters: {},
  providersTotal: 0,
  providersFilters: {},
  bookingsTotal: 0,
  bookingsFilters: {},
  logsTotal: 0,
  logsFilters: {},

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
    // A refetch after a mutation passes no filters; reusing the last ones keeps the list
    // the admin was looking at instead of silently resetting it under a filled search box.
    const effective = filters ?? get().usersFilters;
    const seq = ++usersRequestSeq;
    set({ isLoadingUsers: true, error: null, usersFilters: effective });
    const paging = (usersPaging = pagingFor(usersPaging, effective));
    try {
      const result = await getUsers(effective, paging.cursors);
      // A newer fetch started while this one was in flight: its answer is the one on screen.
      if (seq !== usersRequestSeq) return;
      if (result.cursors) paging.cursors = result.cursors;
      set({
        users: result.users,
        usersTotal: result.total,
        isLoadingUsers: false,
      });
    } catch (error: any) {
      if (seq !== usersRequestSeq) return;
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
          u.id === userId ? { ...u, isSuspended: true } : u
        ),
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
          u.id === userId ? { ...u, isSuspended: false } : u
        ),
      }));
    } catch (error: any) {
      set({ error: error.message || "Failed to activate user" });
      throw error;
    }
  },

  // Fetch providers
  fetchProviders: async (filters?: ProviderFilters) => {
    // Same as fetchUsers: a refetch after a mutation reuses the filters on screen.
    const effective = filters ?? get().providersFilters;
    const seq = ++providersRequestSeq;
    set({ isLoadingProviders: true, error: null, providersFilters: effective });
    const paging = (providersPaging = pagingFor(providersPaging, effective));
    try {
      const result = await getProviders(effective, paging.cursors);
      if (seq !== providersRequestSeq) return;
      if (result.cursors) paging.cursors = result.cursors;
      set({
        providers: result.providers,
        providersTotal: result.total,
        isLoadingProviders: false,
      });
    } catch (error: any) {
      if (seq !== providersRequestSeq) return;
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
    // Same as fetchUsers: a refetch after a mutation (cancel, refund) keeps the page on screen.
    const effective = filters ?? get().bookingsFilters;
    const seq = ++bookingsRequestSeq;
    set({ isLoadingBookings: true, error: null, bookingsFilters: effective });
    const paging = (bookingsPaging = pagingFor(bookingsPaging, effective));
    try {
      const result = await getBookings(effective, paging.cursors);
      if (seq !== bookingsRequestSeq) return;
      if (result.cursors) paging.cursors = result.cursors;
      set({
        bookings: result.bookings,
        bookingsTotal: result.total,
        isLoadingBookings: false,
      });
    } catch (error: any) {
      if (seq !== bookingsRequestSeq) return;
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
    const effective = filters ?? get().logsFilters;
    const seq = ++logsRequestSeq;
    set({ isLoadingLogs: true, error: null, logsFilters: effective });
    const paging = (logsPaging = pagingFor(logsPaging, effective));
    try {
      const result = await getSystemLogs(effective, paging.cursors);
      if (seq !== logsRequestSeq) return;
      if (result.cursors) paging.cursors = result.cursors;
      set({
        systemLogs: result.logs,
        logsTotal: result.total,
        isLoadingLogs: false,
      });
    } catch (error: any) {
      if (seq !== logsRequestSeq) return;
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
    action: "activate" | "suspend"
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
