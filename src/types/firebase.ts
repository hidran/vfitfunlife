import { Timestamp, GeoPoint } from "firebase/firestore";
import type { AppLocale } from "@/types/locale";

// Section type
export type Section = "fit" | "fun" | "life";

// User role type
export type UserRole = "superadmin" | "admin" | "provider" | "customer";

// Provider application status (layered on top of role; role stays "customer")
export type ProviderStatus = "none" | "pending" | "verified" | "rejected";

// Stored application status on the instructor doc (never "none" — absence means not an applicant)
export type ProviderApplicationStatus = Exclude<ProviderStatus, "none">;

// Certification type
export interface Certification {
  id: string;
  name: string;
  issuingOrganization: string;
  issueDate: Timestamp;
  expiryDate: Timestamp | null;
  documentUrl: string | null;
  isVerified: boolean;
}

// Education type
export interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: Timestamp;
  endDate: Timestamp | null;
  isOngoing: boolean;
}

// Social links type
export interface SocialLinks {
  instagram?: string;
  linkedin?: string;
  website?: string;
  facebook?: string;
  twitter?: string;
}

// Notification settings type
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  marketing: boolean;
  bookingReminders: boolean;
  promotions: boolean;
  newMessages: boolean;
}

// Privacy settings type
export interface PrivacySettings {
  profileVisible: boolean;
  bookingsVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
}

// Provider profile type
export interface ProviderProfile {
  professionalBio: string;
  specialties: string[];
  certifications: Certification[];
  yearsOfExperience: number;
  languages: string[];
  education: Education[];
  licenseNumber: string | null;
  cancellationPolicy: string | null;
  isVerified: boolean;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  portfolioImages: string[];
  servicePricing: ServicePricing[];
  availabilitySchedule: AvailabilitySchedule | null;
}

// Service pricing type
export interface ServicePricing {
  id: string;
  serviceName: string;
  description: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

// Availability schedule type
export interface AvailabilitySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  isAvailable: boolean;
  slots: TimeSlot[];
}

export interface TimeSlot {
  start: string;
  end: string;
}

// User types
export interface User {
  id: string;
  uid: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  dateOfBirth: Timestamp | null;
  
  // Role
  role: UserRole;
  // Provider application status (absent ⇒ "none")
  providerStatus?: ProviderStatus;
  // Kind of provider, e.g. "personal_trainer", "psychologist" (providers only)
  userType?: string | null;

  // VIP Status
  isVip: boolean;
  vipExpiresAt: Timestamp | null;
  vipPlanId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;

  // Balances
  pointsBalance: number;
  walletBalance: number;

  // Preferences
  preferredLanguage: AppLocale;
  preferredSection: Section;
  notificationsEnabled: boolean;
  // UI theme preference (synced across devices); absent ⇒ device default (dark)
  theme?: 'dark' | 'light';

  // Push tokens
  fcmTokens: FcmToken[];

  // Referral
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  
  // Profile
  bio: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  
  // Social links
  socialLinks: SocialLinks | null;
  
  // Provider profile (only for providers)
  providerProfile: ProviderProfile | null;
  
  // Settings
  notificationSettings: NotificationSettings;
  privacySettings: PrivacySettings;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface FcmToken {
  token: string;
  platform: "ios" | "android" | "web";
  updatedAt: Timestamp;
}

export interface UserAddress {
  id: string;
  label: string;
  street: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  location: GeoPoint;
  geohash: string;
  isDefault: boolean;
  createdAt: Timestamp;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type:
    | "booking_reminder"
    | "booking_confirmed"
    | "booking_cancelled"
    | "promo"
    | "event"
    | "points_earned"
    | "vip"
    | "challenge"
    | "system";
  data: Record<string, any>;
  imageUrl: string | null;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface PointsTransaction {
  id: string;
  points: number;
  type: "earned" | "spent" | "expired" | "bonus" | "refund";
  source: "booking" | "review" | "referral" | "challenge" | "promotion" | "welcome" | "manual";
  sourceId: string | null;
  description: string;
  balanceAfter: number;
  createdAt: Timestamp;
}

// Venue types
export interface Venue {
  id: string;
  name: string;
  slug: string;
  type: "gym" | "wellness_center" | "beauty_salon" | "outdoor_space" | "event_space";
  section: Section;

  // Contact
  phone: string;
  email: string;
  website: string | null;
  whatsapp: string | null;

  // Location
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  location: GeoPoint;
  geohash: string;

  // Details
  description: string;
  shortDescription: string;
  openingHours: Record<string, OpeningHour>;
  amenities: string[];

  // Media
  coverImage: string;
  images: string[];
  virtualTourUrl: string | null;

  // Ratings
  ratingAvg: number;
  reviewCount: number;

  // Flags
  isPartner: boolean;
  isFeatured: boolean;
  isActive: boolean;

  // Search
  searchKeywords: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OpeningHour {
  open: string;
  close: string;
  isClosed: boolean;
}

export interface VenueService {
  id: string;
  categoryId: string;
  categorySlug: string;
  name: string;
  description: string;

  // Pricing
  price: number;
  vipPrice: number | null;
  discountedPrice: number | null;
  discountEndsAt: Timestamp | null;

  // Duration
  durationMinutes: number;

  // Home service
  isHomeService: boolean;
  homeServiceFee: number;
  homeServiceMinDistance: number;
  homeServiceMaxDistance: number;

  // Media
  images: string[];

  // Availability
  isActive: boolean;
  requiresDeposit: boolean;
  depositAmount: number | null;

  createdAt: Timestamp;
}

// Instructor types
export interface Instructor {
  id: string;
  userId: string | null;
  venueId: string | null;

  // Profile
  fullName: string;
  avatarUrl: string | null;
  coverImage: string | null;
  videoIntroUrl: string | null;
  bio: string;
  shortBio: string;

  // Professional
  specialties: string[];
  certifications: string[];
  experienceYears: number;
  languages: string[];

  // Ratings
  ratingAvg: number;
  reviewCount: number;
  completedSessions: number;

  // Pricing
  hourlyRate: number;
  sessionRate: number | null;

  // Home Service
  homeServiceAvailable: boolean;
  homeServiceRadiusKm: number;
  homeServiceFee: number;
  serviceAreaCenter: GeoPoint | null;
  serviceAreaGeohash: string | null;

  // Services offered
  services: InstructorService[];

  // Contact
  phone: string | null;
  email: string | null;

  // Flags
  isVerified: boolean;
  isFeatured: boolean;
  isActive: boolean;
  acceptingNewClients: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InstructorService {
  serviceId: string;
  serviceName: string;
  customPrice: number | null;
}

export interface InstructorAvailability {
  id: string;
  date: Timestamp;
  slots: AvailabilitySlot[];
  isAvailable: boolean;
  updatedAt: Timestamp;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  isBooked: boolean;
  bookingId: string | null;
}

// Booking types
export type BookingStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "pending" | "deposit_paid" | "paid" | "refunded" | "partial_refund";
export type PaymentMethod = "card" | "wallet" | "points" | "cash" | "mixed";
export type BookingType = "in_venue" | "home_service" | "virtual" | "outdoor";

export interface Booking {
  id: string;
  userId: string;
  venueId: string;
  serviceId: string;
  instructorId: string | null;

  // Denormalized data
  userName: string;
  userPhone: string;
  userEmail: string | null;
  venueName: string;
  venueAddress: string;
  serviceName: string;
  instructorName: string | null;

  // Booking details
  bookingType: BookingType;
  serviceAddress: ServiceAddress | null;

  // Schedule
  scheduledAt: Timestamp;
  scheduledEndAt: Timestamp;
  durationMinutes: number;

  // Status
  status: BookingStatus;

  // Pricing
  originalPrice: number;
  discountAmount: number;
  homeServiceFee: number;
  finalPrice: number;
  depositAmount: number;
  depositPaid: boolean;

  // Points
  pointsEarned: number;
  pointsUsed: number;
  pointsValue: number;

  // Promotion
  promotionId: string | null;
  promotionCode: string | null;

  // Payment
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  stripePaymentIntentId: string | null;

  // Notes
  userNotes: string | null;
  internalNotes: string | null;

  // Cancellation
  cancelledAt: Timestamp | null;
  cancelledBy: "user" | "instructor" | "venue" | "admin" | null;
  cancellationReason: string | null;
  refundAmount: number | null;

  // Review
  hasReviewed: boolean;
  reviewId: string | null;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

export interface ServiceAddress {
  street: string;
  city: string;
  postalCode: string;
  location: GeoPoint;
}

// Fitness Class types
export type DifficultyLevel = "beginner" | "intermediate" | "advanced" | "all_levels";

export interface FitnessClass {
  id: string;
  venueId: string;
  venueName: string;
  instructorId: string;
  instructorName: string;

  // Class info
  name: string;
  description: string;
  classType: string;
  difficultyLevel: DifficultyLevel;

  // Details
  durationMinutes: number;
  maxParticipants: number;
  equipmentNeeded: string[];
  whatToBring: string[];

  // Pricing
  pricePerClass: number;
  pricePackage5: number | null;
  pricePackage10: number | null;
  priceMonthlyUnlimited: number | null;

  // Media
  coverImage: string;
  images: string[];

  // Virtual
  isVirtualAvailable: boolean;
  virtualPrice: number | null;

  // Flags
  isActive: boolean;
  isFeatured: boolean;

  createdAt: Timestamp;
}

export interface ClassSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  specificDate: Timestamp | null;
  maxParticipants: number;
  currentParticipants: number;
  waitlistCount: number;
  isRecurring: boolean;
  isCancelled: boolean;
  cancellationReason: string | null;
  updatedAt: Timestamp;
}

// Event types
export type EventType = "party" | "vr_experience" | "live_dj" | "competition" | "workshop" | "corporate" | "special";
export type EventStatus = "draft" | "published" | "sold_out" | "cancelled" | "completed";

export interface Event {
  id: string;
  venueId: string;
  venueName: string;
  venueAddress: string;

  // Event info
  title: string;
  description: string;
  shortDescription: string;
  eventType: EventType;

  // Schedule
  startDatetime: Timestamp;
  endDatetime: Timestamp;
  doorsOpenAt: Timestamp | null;

  // Capacity
  maxCapacity: number;
  currentAttendees: number;
  waitlistEnabled: boolean;

  // Pricing
  price: number;
  vipPrice: number | null;
  earlyBirdPrice: number | null;
  earlyBirdUntil: Timestamp | null;
  groupPrice: number | null;
  groupMinSize: number | null;

  // Details
  includes: string[];
  dressCode: string | null;
  ageRestriction: number | null;

  // Media
  coverImage: string;
  images: string[];
  videoUrl: string | null;

  // Restrictions
  isVipOnly: boolean;

  // Status
  status: EventStatus;

  // External
  externalTicketUrl: string | null;

  // Search
  searchKeywords: string[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Other types
export interface ServiceCategory {
  id: string;
  section: Section;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  displayOrder: number;
  parentId: string | null;
  isActive: boolean;
}

export interface VipPlan {
  id: string;
  name: string;
  type: "monthly" | "quarterly" | "yearly";
  price: number;
  discountPercent: number;
  features: string[];
  stripePriceId: string;
  isPopular: boolean;
  isActive: boolean;
}

export type ChallengeType = "streak" | "total_classes" | "try_new" | "referral" | "spend";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  challengeType: ChallengeType;
  targetValue: number;
  pointsReward: number;
  badgeImageUrl: string | null;
  startDate: Timestamp;
  endDate: Timestamp;
  participantCount: number;
  isActive: boolean;
}

export type DiscountType = "percentage" | "fixed_amount" | "free_session";

export interface Promotion {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  maxUses: number | null;
  currentUses: number;
  perUserLimit: number;
  applicableSections: Section[];
  applicableServiceIds: string[] | null;
  vipOnly: boolean;
  newUsersOnly: boolean;
  validFrom: Timestamp;
  validUntil: Timestamp;
  isActive: boolean;
}

export type StreamingCategory = "workout" | "talk_show" | "cooking" | "gaming" | "event";

export interface StreamingSchedule {
  id: string;
  title: string;
  description: string;
  streamerName: string;
  twitchChannel: string;
  category: StreamingCategory;
  scheduledAt: Timestamp;
  durationMinutes: number;
  isLive: boolean;
  thumbnailUrl: string | null;
}

// Review type
export interface Review {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  bookingId: string;
  rating: number;
  comment: string;
  images: string[];
  isVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
