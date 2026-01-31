import { Timestamp } from "firebase/firestore";
import { Booking, BookingStatus, PaymentStatus, ServicePricing, User } from "./firebase";

// Dashboard Stats
export interface DashboardStats {
  todayAppointments: number;
  weekBookings: number;
  monthEarnings: number;
  newClients: number;
  completionRate: number;
  averageRating: number;
  chartData: { date: string; bookings: number; earnings: number }[];
}

// Schedule Events
export type ScheduleEventType = 'booking' | 'blocked';
export type ScheduleEventStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: ScheduleEventType;
  status?: ScheduleEventStatus;
  clientName?: string;
  serviceName?: string;
  clientPhotoUrl?: string;
  bookingId?: string;
  notes?: string;
  location?: string;
  meetingLink?: string;
}

// Availability Types
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TimeRange {
  start: string; // HH:mm format
  end: string;   // HH:mm format
}

export interface DayAvailability {
  isAvailable: boolean;
  slots: TimeRange[];
}

export interface WeeklySchedule {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

export interface DateOverride {
  id: string;
  date: string; // YYYY-MM-DD format
  isAvailable: boolean;
  slots: TimeRange[];
  reason?: string;
}

export interface AvailabilitySettings {
  weeklySchedule: WeeklySchedule;
  dateOverrides: DateOverride[];
  bufferMinutes: number;
  minAdvanceNoticeHours: number;
  maxBookingsPerDay: number;
  timezone: string;
}

// Earnings Types
export type TransactionType = 'booking_payment' | 'withdrawal' | 'refund' | 'adjustment' | 'bonus';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
  bookingId?: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
}

export interface EarningsData {
  availableBalance: number;
  pendingAmount: number;
  monthTotal: number;
  yearTotal: number;
  lifetimeTotal: number;
  transactions: Transaction[];
}

export interface EarningsFilters {
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  status?: TransactionStatus;
}

// Client Types
export interface ProviderClient {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  totalBookings: number;
  totalSpent: number;
  lastVisit?: Date;
  firstVisit?: Date;
  notes?: string;
  tags?: string[];
}

export interface ClientBookingHistory {
  booking: Booking;
  serviceName: string;
  date: Date;
  status: BookingStatus;
  amount: number;
}

export interface ClientNote {
  id: string;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// Service Management Types
export interface ProviderService extends ServicePricing {
  categoryId: string;
  categoryName: string;
  coverImage?: string;
  requirements?: string;
  preparationInstructions?: string;
  cancellationPolicy?: string;
  bookingCount: number;
  revenue: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Booking Filters
export interface BookingFilters {
  status?: BookingStatus | 'all';
  startDate?: Date;
  endDate?: Date;
  serviceId?: string;
  clientId?: string;
  searchQuery?: string;
}

// Provider Booking Extended
export interface ProviderBooking extends Booking {
  clientPhotoUrl?: string;
  serviceColor?: string;
  isReviewed: boolean;
  providerNotes?: string;
}

// Notification Types
export type ProviderNotificationType = 
  | 'new_booking'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'client_message'
  | 'payment_received'
  | 'upcoming_appointment'
  | 'review_received'
  | 'system';

export interface ProviderNotification {
  id: string;
  type: ProviderNotificationType;
  title: string;
  message: string;
  bookingId?: string;
  clientId?: string;
  isRead: boolean;
  createdAt: Timestamp;
  data?: Record<string, any>;
}

// Calendar View Types
export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

// Withdrawal Types
export interface WithdrawalRequest {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  method: 'bank_transfer' | 'paypal' | 'stripe';
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  notes?: string;
}

export interface PaymentMethod {
  id: string;
  type: 'bank_account' | 'paypal' | 'stripe';
  isDefault: boolean;
  // Bank account fields
  accountHolderName?: string;
  bankName?: string;
  accountNumberLast4?: string;
  iban?: string;
  // PayPal fields
  paypalEmail?: string;
  // Stripe fields
  stripeAccountId?: string;
}

// Activity Types
export interface ActivityItem {
  id: string;
  type: 'booking' | 'client' | 'earnings' | 'review' | 'system';
  action: string;
  description: string;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

// Performance Metrics
export interface PerformanceMetrics {
  totalRevenue: number;
  totalBookings: number;
  uniqueClients: number;
  completionRate: number;
  cancellationRate: number;
  averageRating: number;
  responseTimeMinutes: number;
}

// Export Types
export interface ExportOptions {
  format: 'csv' | 'pdf' | 'excel';
  dateRange: { start: Date; end: Date };
  includeFields: string[];
}
