"use client";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  startAfter,
  QueryConstraint,
  writeBatch,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./config";
import { cancelBooking as cancelBookingFn } from "./functions";
import {
  AdminDashboardStats,
  UserFilters,
  ProviderFilters,
  BookingFilters,
  LogFilters,
  PlatformSettings,
  SystemLog,
  UserTypeData,
  ServiceCategoryData,
  VerificationData,
  AnnouncementData,
  AdminUser,
  AdminProvider,
  AdminTransaction,
  PayoutRequest,
  BulkActionResult,
} from "@/types/admin";
import { Booking, User, UserRole } from "@/types/firebase";

const ADMIN_COLLECTION = "admins";
const USERS_COLLECTION = "users";
const PROVIDERS_COLLECTION = "providers";
const BOOKINGS_COLLECTION = "bookings";
const LOGS_COLLECTION = "systemLogs";
const SETTINGS_DOC = "platform/settings";
const USER_TYPES_COLLECTION = "userTypes";
const SERVICE_CATEGORIES_COLLECTION = "serviceCategories";
const TRANSACTIONS_COLLECTION = "transactions";
const PAYOUTS_COLLECTION = "payoutRequests";

// Helper to convert Firestore timestamp to Date
const convertTimestamps = (data: any): any => {
  if (!data) return data;
  if (data instanceof Timestamp) return data.toDate();
  if (data instanceof Date) return data;
  // Preserve arrays: spreading an array into an object ({ ...array }) would turn
  // it into a plain object with numeric keys, breaking downstream .map()/.length
  // (e.g. providerProfile.specialties). Map each element through instead.
  if (Array.isArray(data)) return data.map((item) => convertTimestamps(item));
  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const key in data) {
      result[key] = convertTimestamps(data[key]);
    }
    return result;
  }
  return data;
};

// Seeded demo provider accounts use the @demo.vfit email domain and/or a
// `provider_<timestamp>_<n>` document id rather than a real Firebase Auth uid.
const DEMO_EMAIL_DOMAIN = "@demo.vfit";

/**
 * True when a user/provider document is a soft-deleted account (isDeleted /
 * deletedAt) or a seeded demo account, and should be hidden from admin lists.
 * Applied client-side because a Firestore `!=` filter on isDeleted would also
 * exclude the (vast majority of) real docs that simply lack the field.
 */
const isHiddenAccount = (id: string, data: any): boolean => {
  if (!data) return false;
  if (data.isDeleted === true || data.deletedAt) return true;
  const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
  if (email.endsWith(DEMO_EMAIL_DOMAIN)) return true;
  if (typeof id === "string" && id.startsWith("provider_")) return true;
  return false;
};

// Get admin dashboard stats
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  try {
    // Get total users count
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const totalUsers = usersSnapshot.size;

    // Get active providers count
    const providersQuery = query(
      collection(db, USERS_COLLECTION),
      where("role", "==", "provider"),
      where("providerProfile.isActive", "==", true)
    );
    const providersSnapshot = await getDocs(providersQuery);
    const activeProviders = providersSnapshot.size;

    // Get today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayQuery = query(
      collection(db, BOOKINGS_COLLECTION),
      where("scheduledAt", ">=", Timestamp.fromDate(today))
    );
    const todayBookingsSnapshot = await getDocs(todayQuery);
    const todayBookings = todayBookingsSnapshot.size;

    // Get monthly revenue
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const revenueQuery = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where("createdAt", ">=", Timestamp.fromDate(firstDayOfMonth)),
      where("type", "==", "booking_payment"),
      where("status", "==", "completed")
    );
    const revenueSnapshot = await getDocs(revenueQuery);
    const monthlyRevenue = revenueSnapshot.docs.reduce(
      (sum, doc) => sum + (doc.data().amount || 0),
      0
    );

    // Get pending verifications
    const pendingVerificationsQuery = query(
      collection(db, USERS_COLLECTION),
      where("role", "==", "provider"),
      where("providerProfile.isVerified", "==", false)
    );
    const pendingVerificationsSnapshot = await getDocs(pendingVerificationsQuery);
    const pendingVerifications = pendingVerificationsSnapshot.docs.filter(
      (d) => !isHiddenAccount(d.id, d.data())
    ).length;

    // Get recent activity
    const activityQuery = query(
      collection(db, LOGS_COLLECTION),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const activitySnapshot = await getDocs(activityQuery);
    const recentActivity = activitySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminDashboardStats["recentActivity"];

    // Calculate growth percentages (mock for now - would compare with previous periods)
    const userGrowth = 12.5;
    const providerGrowth = 8.3;
    const bookingGrowth = 15.2;
    const revenueGrowth = 23.1;

    return {
      totalUsers,
      userGrowth,
      activeProviders,
      providerGrowth,
      todayBookings,
      bookingGrowth,
      monthlyRevenue,
      revenueGrowth,
      pendingVerifications,
      openTickets: 0, // Would come from support tickets collection
      recentActivity,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    throw error;
  }
}

// Get users with filters
export async function getUsers(
  filters: UserFilters
): Promise<{ users: AdminUser[]; total: number }> {
  try {
    const constraints: QueryConstraint[] = [];

    if (filters.role && filters.role !== "all") {
      constraints.push(where("role", "==", filters.role));
    }

    // Note: For status filter, we would need a status field on users
    // For now, we'll filter client-side

    constraints.push(orderBy("createdAt", "desc"));

    const q = query(collection(db, USERS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let users = snapshot.docs.map((doc) => ({
      id: doc.id,
      uid: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminUser[];

    // Client-side filtering for search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.fullName?.toLowerCase().includes(searchLower) ||
          u.email?.toLowerCase().includes(searchLower) ||
          u.phone?.toLowerCase().includes(searchLower)
      );
    }

    // Date filtering (createdAt is already converted to Date by convertTimestamps)
    if (filters.dateFrom) {
      users = users.filter((u) => (u.createdAt as unknown as Date) >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      users = users.filter((u) => (u.createdAt as unknown as Date) <= filters.dateTo!);
    }

    const total = users.length;

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.limit || 20;
    const start = (page - 1) * pageSize;
    users = users.slice(start, start + pageSize);

    return { users, total };
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

// Update user role
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      role,
      updatedAt: serverTimestamp(),
    });

    // Log action
    await logAdminAction("UPDATE_USER_ROLE", `Updated user ${userId} role to ${role}`);
  } catch (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
}

// Suspend user
export async function suspendUser(userId: string, reason: string): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      isSuspended: true,
      suspensionReason: reason,
      suspendedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("SUSPEND_USER", `Suspended user ${userId}. Reason: ${reason}`);
  } catch (error) {
    console.error("Error suspending user:", error);
    throw error;
  }
}

// Activate user
export async function activateUser(userId: string): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      isSuspended: false,
      suspensionReason: null,
      suspendedAt: null,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("ACTIVATE_USER", `Activated user ${userId}`);
  } catch (error) {
    console.error("Error activating user:", error);
    throw error;
  }
}

// Get providers with filters
export async function getProviders(
  filters: ProviderFilters
): Promise<{ providers: AdminProvider[]; total: number }> {
  try {
    const constraints: QueryConstraint[] = [where("role", "==", "provider")];

    if (filters.verificationStatus && filters.verificationStatus !== "all") {
      if (filters.verificationStatus === "verified") {
        constraints.push(where("providerProfile.isVerified", "==", true));
      } else if (filters.verificationStatus === "pending") {
        constraints.push(where("providerProfile.isVerified", "==", false));
      }
    }

    constraints.push(orderBy("createdAt", "desc"));

    const q = query(collection(db, USERS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let providers = (snapshot.docs.map((doc) => ({
      id: doc.id,
      uid: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminProvider[]).filter((p) => !isHiddenAccount(p.id, p));

    // Client-side filtering for search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      providers = providers.filter(
        (p) =>
          p.fullName?.toLowerCase().includes(searchLower) ||
          p.email?.toLowerCase().includes(searchLower)
      );
    }

    const total = providers.length;

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.limit || 20;
    const start = (page - 1) * pageSize;
    providers = providers.slice(start, start + pageSize);

    return { providers, total };
  } catch (error) {
    console.error("Error fetching providers:", error);
    throw error;
  }
}

// Get pending verifications
export async function getPendingVerifications(): Promise<AdminProvider[]> {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "==", "provider"),
      where("providerProfile.isVerified", "==", false),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return (snapshot.docs.map((doc) => ({
      id: doc.id,
      uid: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminProvider[]).filter((p) => !isHiddenAccount(p.id, p));
  } catch (error) {
    console.error("Error fetching pending verifications:", error);
    throw error;
  }
}

// Verify provider
export async function verifyProvider(
  providerId: string,
  data: VerificationData
): Promise<void> {
  try {
    // Fall back to the acting admin's uid; never write undefined (Firestore rejects it).
    const verifiedBy = data.verifiedBy ?? auth.currentUser?.uid ?? null;
    const providerRef = doc(db, USERS_COLLECTION, providerId);
    await updateDoc(providerRef, {
      "providerProfile.isVerified": true,
      "providerProfile.verifiedAt": serverTimestamp(),
      "providerProfile.verifiedBy": verifiedBy,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("VERIFY_PROVIDER", `Verified provider ${providerId}`);
  } catch (error) {
    console.error("Error verifying provider:", error);
    throw error;
  }
}

// Reject provider
export async function rejectProvider(providerId: string, reason: string): Promise<void> {
  try {
    const providerRef = doc(db, USERS_COLLECTION, providerId);
    await updateDoc(providerRef, {
      "providerProfile.verificationRejected": true,
      "providerProfile.rejectionReason": reason,
      "providerProfile.rejectedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("REJECT_PROVIDER", `Rejected provider ${providerId}. Reason: ${reason}`);
  } catch (error) {
    console.error("Error rejecting provider:", error);
    throw error;
  }
}

// Get bookings with filters
export async function getBookings(
  filters: BookingFilters
): Promise<{ bookings: Booking[]; total: number }> {
  try {
    const constraints: QueryConstraint[] = [];

    if (filters.status && filters.status !== "all") {
      constraints.push(where("status", "==", filters.status));
    }

    if (filters.providerId) {
      constraints.push(where("providerId", "==", filters.providerId));
    }

    if (filters.customerId) {
      constraints.push(where("userId", "==", filters.customerId));
    }

    constraints.push(orderBy("createdAt", "desc"));

    const q = query(collection(db, BOOKINGS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let bookings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as Booking[];

    // Date filtering (scheduledAt is already converted to Date by convertTimestamps)
    if (filters.dateFrom) {
      bookings = bookings.filter((b) => (b.scheduledAt as unknown as Date) >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      bookings = bookings.filter((b) => (b.scheduledAt as unknown as Date) <= filters.dateTo!);
    }

    // Search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      bookings = bookings.filter(
        (b) =>
          b.id.toLowerCase().includes(searchLower) ||
          (b as any).userName?.toLowerCase().includes(searchLower) ||
          (b as any).providerName?.toLowerCase().includes(searchLower)
      );
    }

    const total = bookings.length;

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.limit || 20;
    const start = (page - 1) * pageSize;
    bookings = bookings.slice(start, start + pageSize);

    return { bookings, total };
  } catch (error) {
    console.error("Error fetching bookings:", error);
    throw error;
  }
}

/**
 * Cancel a booking as admin.
 *
 * Goes through the `cancelBooking` callable rather than writing the document. Admin still
 * has rules-level update access, but a direct write would skip the statusHistory entry and
 * the actorRole attribution that P0-2's trainer-reliability metric depends on — an admin
 * cancellation must not read as the trainer's.
 */
export async function cancelBookingAdmin(bookingId: string, reason: string): Promise<void> {
  try {
    await cancelBookingFn({ bookingId, reason });
    await logAdminAction("CANCEL_BOOKING", `Cancelled booking ${bookingId}. Reason: ${reason}`);
  } catch (error) {
    console.error("Error cancelling booking:", error);
    throw error;
  }
}

// Process refund
export async function processRefund(bookingId: string, amount: number): Promise<void> {
  try {
    // This would typically call a Cloud Function to handle Stripe refund
    const processRefundFn = httpsCallable(functions, "processRefund");
    await processRefundFn({ bookingId, amount });

    await logAdminAction("PROCESS_REFUND", `Processed refund of ${amount} for booking ${bookingId}`);
  } catch (error) {
    console.error("Error processing refund:", error);
    throw error;
  }
}

// Get platform settings
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const settingsRef = doc(db, SETTINGS_DOC);
    const snapshot = await getDoc(settingsRef);

    if (snapshot.exists()) {
      return convertTimestamps(snapshot.data()) as PlatformSettings;
    }

    // Return default settings
    return {
      platformName: "VFit",
      commissionPercentage: 15,
      cancellationPolicy: "24 hours",
      currency: "EUR",
      supportEmail: "support@vfit.com",
    };
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    throw error;
  }
}

// Update platform settings
export async function updatePlatformSettings(settings: PlatformSettings): Promise<void> {
  try {
    const settingsRef = doc(db, SETTINGS_DOC);
    // setDoc/merge, not updateDoc: getPlatformSettings returns hardcoded defaults when the
    // document is missing, so the very first save was always against a document that did
    // not exist — and updateDoc fails outright on those rather than creating one.
    await setDoc(
      settingsRef,
      {
        ...settings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await logAdminAction("UPDATE_SETTINGS", "Updated platform settings");
  } catch (error) {
    console.error("Error updating platform settings:", error);
    throw error;
  }
}

// Get system logs
export async function getSystemLogs(
  filters: LogFilters
): Promise<{ logs: SystemLog[]; total: number }> {
  try {
    const constraints: QueryConstraint[] = [];

    if (filters.severity && filters.severity !== "all") {
      constraints.push(where("severity", "==", filters.severity));
    }

    if (filters.userId) {
      constraints.push(where("userId", "==", filters.userId));
    }

    constraints.push(orderBy("timestamp", "desc"));

    const q = query(collection(db, LOGS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as SystemLog[];

    // Date filtering (timestamp is already converted to Date by convertTimestamps)
    if (filters.dateFrom) {
      logs = logs.filter((l) => (l.timestamp as unknown as Date) >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      logs = logs.filter((l) => (l.timestamp as unknown as Date) <= filters.dateTo!);
    }

    const total = logs.length;

    // Pagination
    const page = filters.page || 1;
    const pageSize = filters.limit || 50;
    const start = (page - 1) * pageSize;
    logs = logs.slice(start, start + pageSize);

    return { logs, total };
  } catch (error) {
    console.error("Error fetching system logs:", error);
    throw error;
  }
}

// Create user type
export async function createUserType(data: UserTypeData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, USER_TYPES_COLLECTION), {
      ...data,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      associatedProvidersCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("CREATE_USER_TYPE", `Created user type: ${data.name}`);
    return docRef.id;
  } catch (error) {
    console.error("Error creating user type:", error);
    throw error;
  }
}

// Update user type
export async function updateUserType(id: string, data: UserTypeData): Promise<void> {
  try {
    const typeRef = doc(db, USER_TYPES_COLLECTION, id);
    await updateDoc(typeRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("UPDATE_USER_TYPE", `Updated user type: ${data.name}`);
  } catch (error) {
    console.error("Error updating user type:", error);
    throw error;
  }
}

// Delete user type
export async function deleteUserType(id: string): Promise<void> {
  try {
    const typeRef = doc(db, USER_TYPES_COLLECTION, id);
    await updateDoc(typeRef, {
      isActive: false,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("DELETE_USER_TYPE", `Deleted user type: ${id}`);
  } catch (error) {
    console.error("Error deleting user type:", error);
    throw error;
  }
}

// Create service category
export async function createServiceCategory(data: ServiceCategoryData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, SERVICE_CATEGORIES_COLLECTION), {
      ...data,
      slug: (data.names?.it ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
      order: data.order ?? 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("CREATE_SERVICE_CATEGORY", `Created service category: ${data.names?.it ?? ""}`);
    return docRef.id;
  } catch (error) {
    console.error("Error creating service category:", error);
    throw error;
  }
}

// Update service category
export async function updateServiceCategory(id: string, data: ServiceCategoryData): Promise<void> {
  try {
    const ref = doc(db, SERVICE_CATEGORIES_COLLECTION, id);
    await updateDoc(ref, {
      ...data,
      slug: (data.names?.it ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
      order: data.order ?? 0,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("UPDATE_SERVICE_CATEGORY", `Updated service category: ${data.names?.it ?? ""}`);
  } catch (error) {
    console.error("Error updating service category:", error);
    throw error;
  }
}

// Delete service category (soft delete: mark inactive)
export async function deleteServiceCategory(id: string): Promise<void> {
  try {
    const ref = doc(db, SERVICE_CATEGORIES_COLLECTION, id);
    await updateDoc(ref, {
      isActive: false,
      updatedAt: serverTimestamp(),
    });

    await logAdminAction("DELETE_SERVICE_CATEGORY", `Deleted service category: ${id}`);
  } catch (error) {
    console.error("Error deleting service category:", error);
    throw error;
  }
}

// Create announcement
export async function createAnnouncement(data: AnnouncementData): Promise<void> {
  try {
    await addDoc(collection(db, "announcements"), {
      ...data,
      createdAt: serverTimestamp(),
      sentAt: data.scheduledAt ? null : serverTimestamp(),
      status: data.scheduledAt ? "scheduled" : "sent",
    });

    await logAdminAction("CREATE_ANNOUNCEMENT", `Created announcement: ${data.title}`);
  } catch (error) {
    console.error("Error creating announcement:", error);
    throw error;
  }
}

// Bulk update users
export async function bulkUpdateUsers(
  userIds: string[],
  action: "activate" | "suspend" | "delete"
): Promise<BulkActionResult> {
  const result: BulkActionResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const batch = writeBatch(db);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, USERS_COLLECTION, userId);

        if (action === "delete") {
          // Soft delete
          batch.update(userRef, {
            isDeleted: true,
            deletedAt: serverTimestamp(),
          });
        } else if (action === "suspend") {
          batch.update(userRef, {
            isSuspended: true,
            suspendedAt: serverTimestamp(),
          });
        } else if (action === "activate") {
          batch.update(userRef, {
            isSuspended: false,
            suspendedAt: null,
          });
        }

        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ id: userId, error: error.message });
      }
    }

    await batch.commit();

    await logAdminAction(
      "BULK_UPDATE_USERS",
      `Bulk ${action} on ${userIds.length} users. Processed: ${result.processed}, Failed: ${result.failed}`
    );

    return result;
  } catch (error) {
    console.error("Error in bulk update:", error);
    throw error;
  }
}

// Bulk update users role
export async function bulkUpdateUserRole(
  userIds: string[],
  role: UserRole
): Promise<BulkActionResult> {
  const result: BulkActionResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const batch = writeBatch(db);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, USERS_COLLECTION, userId);
        batch.update(userRef, {
          role,
          updatedAt: serverTimestamp(),
        });
        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ id: userId, error: error.message });
      }
    }

    await batch.commit();

    await logAdminAction(
      "BULK_UPDATE_USER_ROLE",
      `Set role=${role} on ${result.processed} users. Failed: ${result.failed}`
    );

    return result;
  } catch (error) {
    console.error("Error in bulk role update:", error);
    throw error;
  }
}

// Export data
export async function exportData(
  collection: string,
  options: { format: "csv" | "excel"; filters?: Record<string, any> }
): Promise<string> {
  try {
    // This would typically call a Cloud Function to generate and return a download URL
    const exportDataFn = httpsCallable(functions, "exportData");
    const result = await exportDataFn({ collection, ...options });
    return (result.data as any).downloadUrl;
  } catch (error) {
    console.error("Error exporting data:", error);
    throw error;
  }
}

// Get admin transactions
export async function getAdminTransactions(filters?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}): Promise<AdminTransaction[]> {
  try {
    const constraints: QueryConstraint[] = [];

    if (filters?.status && filters.status !== "all") {
      constraints.push(where("status", "==", filters.status));
    }

    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(100));

    const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    let transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as AdminTransaction[];

    // Date filtering (createdAt is already converted to Date by convertTimestamps)
    if (filters?.dateFrom) {
      transactions = transactions.filter((t) => (t.createdAt as unknown as Date) >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      transactions = transactions.filter((t) => (t.createdAt as unknown as Date) <= filters.dateTo!);
    }

    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
}

// Get payout requests
export async function getPayoutRequests(status?: string): Promise<PayoutRequest[]> {
  try {
    const constraints: QueryConstraint[] = [];

    if (status && status !== "all") {
      constraints.push(where("status", "==", status));
    }

    constraints.push(orderBy("requestedAt", "desc"));

    const q = query(collection(db, PAYOUTS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data()),
    })) as PayoutRequest[];
  } catch (error) {
    console.error("Error fetching payout requests:", error);
    throw error;
  }
}

// Process payout
export async function processPayout(
  payoutId: string,
  status: "completed" | "rejected",
  notes?: string
): Promise<void> {
  try {
    const payoutRef = doc(db, PAYOUTS_COLLECTION, payoutId);
    await updateDoc(payoutRef, {
      status,
      processedAt: serverTimestamp(),
      notes,
    });

    await logAdminAction(
      "PROCESS_PAYOUT",
      `Processed payout ${payoutId} as ${status}${notes ? `. Notes: ${notes}` : ""}`
    );
  } catch (error) {
    console.error("Error processing payout:", error);
    throw error;
  }
}

// Log admin action
async function logAdminAction(action: string, details: string): Promise<void> {
  try {
    await addDoc(collection(db, LOGS_COLLECTION), {
      action,
      details,
      severity: "info",
      by: auth.currentUser?.uid ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error logging admin action:", error);
  }
}
