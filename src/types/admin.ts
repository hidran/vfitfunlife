import { Timestamp } from "firebase/firestore";
import { UserRole, User, Booking } from "./firebase";

// Admin Dashboard Stats
export interface AdminDashboardStats {
  totalUsers: number;
  userGrowth: number;
  activeProviders: number;
  providerGrowth: number;
  todayBookings: number;
  bookingGrowth: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  pendingVerifications: number;
  openTickets: number;
  recentActivity: ActivityItem[];
  bookingsByStatus?: {
    completed: number;
    confirmed: number;
    pending: number;
    cancelled: number;
  };
}

// Activity Item
export interface ActivityItem {
  id: string;
  type: "user" | "provider" | "booking" | "payment" | "system" | "verification";
  action: string;
  description: string;
  userId?: string;
  userName?: string;
  metadata?: Record<string, any>;
  timestamp: Timestamp;
}

// User Filters
export interface UserFilters {
  role?: UserRole | "all";
  /** hidden = soft-deleted or seeded demo accounts, excluded from every other status. */
  status?: "active" | "suspended" | "hidden" | "all";
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

// Provider Filters
export interface ProviderFilters {
  type?: string;
  verificationStatus?: "pending" | "verified" | "rejected" | "all";
  status?: "active" | "suspended" | "all";
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "bookings" | "revenue" | "rating" | "createdAt";
}

// Booking Filters
export interface BookingFilters {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  providerId?: string;
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// System Log Filters
export interface LogFilters {
  severity?: "info" | "warning" | "error" | "all";
  search?: string;
  userId?: string;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

// Platform Settings
export interface PlatformSettings {
  platformName: string;
  logoUrl?: string;
  commissionPercentage: number;
  cancellationPolicy: string;
  currency: string;
  supportEmail: string;
  supportPhone?: string;
  emailTemplates?: EmailTemplate[];
  notificationSettings?: AdminNotificationSettings;
  maintenanceMode?: boolean;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

// Email Template
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
}

// Notification Settings
export interface AdminNotificationSettings {
  newUserNotifications: boolean;
  newProviderNotifications: boolean;
  bookingNotifications: boolean;
  paymentNotifications: boolean;
  verificationNotifications: boolean;
  supportTicketNotifications: boolean;
  emailAlerts: boolean;
  pushAlerts: boolean;
}

// System Log
export interface SystemLog {
  id: string;
  timestamp: Timestamp;
  userId?: string;
  userName?: string;
  userRole?: UserRole;
  action: string;
  details: string;
  severity: "info" | "warning" | "error";
  ipAddress?: string;
  userAgent?: string;
}

// User Type (for provider categories)
export interface UserType {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  isActive: boolean;
  requirements: string[];
  associatedProvidersCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// User Type Data for create/update
export interface UserTypeData {
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  requirements?: string[];
}

// Service Category (admin-configurable catalog of services a provider can offer)
export interface ServiceCategoryDoc {
  id: string;
  /** @deprecated pre-taxonomy flat label; `names` is the source of truth. */
  name?: string;
  /** Per-locale labels — the catalogue is admin-authored, so i18n keys cannot be used. */
  names?: Record<string, string>;
  /** null for a top-level group. Only leaves may be assigned to a service. */
  parentId?: string | null;
  /** 'fit' | 'fun' | 'life'; a category may belong to several. */
  sections?: string[];
  slug?: string;
  icon: string;
  isActive: boolean;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Service Category Data for create/update
export interface ServiceCategoryData {
  names: Record<string, string>;
  parentId: string | null;
  sections: string[];
  icon: string;
  isActive: boolean;
  order?: number;
}

// Verification Data
export interface VerificationData {
  status: "verified" | "rejected";
  notes?: string;
  verifiedBy?: string;
  verifiedAt?: Timestamp;
  rejectionReason?: string;
}

// Announcement Data
export interface AnnouncementData {
  title: string;
  message: string;
  targetAudience: ("all" | "customers" | "providers" | "admins")[];
  sendEmail: boolean;
  sendPush: boolean;
  scheduledAt?: Timestamp;
}

// Payment/Transaction
export interface AdminTransaction {
  id: string;
  type: "booking_payment" | "payout" | "refund" | "commission" | "adjustment";
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  bookingId?: string;
  providerId?: string;
  providerName?: string;
  customerId?: string;
  customerName?: string;
  description: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
}

// Payout Request
export interface PayoutRequest {
  id: string;
  providerId: string;
  providerName: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "rejected";
  method: "bank_transfer" | "paypal" | "stripe";
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  processedBy?: string;
  notes?: string;
  rejectionReason?: string;
}

// Admin User Extended
export interface AdminUser extends User {
  adminNotes?: string;
  lastLoginIp?: string;
  loginCount: number;
  actionsCount: number;
  isSuspended?: boolean;
  /** Soft-delete marker — see `hiddenAccountKind` in lib/firebase/admin.ts. */
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

// Provider Extended for Admin
export interface AdminProvider extends User {
  verificationDocuments: VerificationDocument[];
  adminNotes?: string;
  performanceMetrics: ProviderPerformanceMetrics;
}

// Verification Document
export interface VerificationDocument {
  id: string;
  type: "id" | "license" | "certification" | "insurance" | "other";
  name: string;
  url: string;
  uploadedAt: Timestamp;
  verifiedAt?: Timestamp;
  verifiedBy?: string;
  status: "pending" | "verified" | "rejected";
  rejectionReason?: string;
}

// Provider Performance Metrics
export interface ProviderPerformanceMetrics {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  commissionPaid: number;
  averageRating: number;
  responseRate: number;
  responseTimeMinutes: number;
}

// Chart Data
export interface ChartDataPoint {
  label: string;
  value: number;
  date?: Date;
}

export interface RevenueChartData {
  daily: ChartDataPoint[];
  weekly: ChartDataPoint[];
  monthly: ChartDataPoint[];
}

// Export Options
export interface ExportOptions {
  format: "csv" | "excel" | "pdf";
  dateRange: { from: Date; to: Date };
  fields: string[];
  filters?: Record<string, any>;
}

// Support Ticket
export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  assignedTo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
  replies: TicketReply[];
}

// Ticket Reply
export interface TicketReply {
  id: string;
  ticketId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  message: string;
  isInternal: boolean;
  createdAt: Timestamp;
}

// Bulk Action Result
export interface BulkActionResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: { id: string; error: string }[];
}

// Firestore Transaction (payments page)
export type TransactionType = 'booking_payment' | 'payout' | 'refund' | 'commission';
export type TransactionStatus = 'completed' | 'pending' | 'failed';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
  customerName: string;
  providerName: string;
  createdAt: import('firebase/firestore').Timestamp;
}
