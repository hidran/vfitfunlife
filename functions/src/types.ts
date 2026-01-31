import * as admin from "firebase-admin";

export interface UserData {
  fullName: string;
  phone: string;
  email: string;
  isVip: boolean;
  pointsBalance: number;
  [key: string]: unknown;
}

export interface VenueData {
  name: string;
  address: string;
  [key: string]: unknown;
}

export interface ServiceData {
  name: string;
  price: number;
  vipPrice?: number;
  isHomeService?: boolean;
  homeServiceFee?: number;
  requiresDeposit?: boolean;
  depositAmount?: number;
  durationMinutes: number;
  [key: string]: unknown;
}

export interface InstructorData {
  fullName: string;
  [key: string]: unknown;
}

export interface PromotionData {
  validFrom: admin.firestore.Timestamp;
  validUntil: admin.firestore.Timestamp;
  maxUses: number | null;
  currentUses: number;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  maxDiscount?: number;
  [key: string]: unknown;
}

// ============================================
// ROLE & PERMISSION SYSTEM
// ============================================

/**
 * User role types
 */
export type UserRole = "superadmin" | "admin" | "provider" | "customer";

/**
 * Permission strings for access control
 */
export type Permission =
  | "users:read"
  | "users:write"
  | "users:delete"
  | "users:manage_roles"
  | "providers:read"
  | "providers:write"
  | "providers:verify"
  | "bookings:read"
  | "bookings:write"
  | "bookings:cancel"
  | "bookings:confirm"
  | "venues:read"
  | "venues:write"
  | "venues:delete"
  | "services:read"
  | "services:write"
  | "services:delete"
  | "config:read"
  | "config:write"
  | "reports:read"
  | "content:read"
  | "content:write"
  | "promotions:read"
  | "promotions:write"
  | "financial:read"
  | "financial:write";

/**
 * Role definition structure
 */
export interface RoleDefinition {
  name: UserRole;
  displayName: string;
  description: string;
  defaultPermissions: Permission[];
  isStaff: boolean;
  canAccessAdminPanel: boolean;
}

/**
 * User type for providers (legacy - simple string type)
 * @deprecated Use the new UserType interface below
 */
export type UserType =
  | "trainer"
  | "hairstylist"
  | "yoga_teacher"
  | "psychologist"
  | "pronunciation_coach"
  | "nutritionist"
  | "massage_therapist"
  | "personal_trainer"
  | "pilates_instructor"
  | "dance_instructor"
  | "other";

/**
 * Legacy user type alias for backward compatibility
 * @deprecated Use the new UserType interface below
 */
export type LegacyUserType = UserType;

/**
 * Provider profile data
 */
export interface ProviderProfile {
  userId?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  userType?: UserType;
  bio?: string;
  specialties?: string[];
  yearsExperience?: number;
  yearsOfExperience?: number; // Alias for compatibility
  certifications?:
    | string[]
    | {
        name: string;
        issuedBy: string;
        issuedAt?: admin.firestore.Timestamp;
        expiresAt?: admin.firestore.Timestamp;
        documentUrl?: string;
        isVerified?: boolean;
      }[];
  languages?: string[];
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  hourlyRate?: number;
  availabilitySchedule?:
    | Record<string, unknown>
    | {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isAvailable: boolean;
      }[];
  serviceArea?:
    | {
        latitude: number;
        longitude: number;
        radiusKm: number;
      }
    | {
        radius: number;
        center: {
          latitude: number;
          longitude: number;
        };
      };
  availability?: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }[];
  servicesOffered?: string[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

// ============================================
// User Types / Categories System (New)
// ============================================

/**
 * User type category definitions
 */
export type UserTypeCategory =
  | "fitness"
  | "wellness"
  | "beauty"
  | "mental_health"
  | "education"
  | "medical";

/**
 * Pricing type for services
 */
export type PricingType = "fixed" | "hourly" | "session";

/**
 * Service definition for a user type
 */
export interface UserTypeService {
  id: string;
  name: string;
  description: string;
  durationOptions: number[]; // in minutes
  pricingType: PricingType;
  basePrice?: number;
}

/**
 * Requirements to become a provider of this type
 */
export interface UserTypeRequirements {
  certifications?: string[];
  yearsExperience?: number;
  backgroundCheck?: boolean;
  insuranceRequired?: boolean;
  licenseRequired?: boolean;
  licenseTypes?: string[];
}

/**
 * User type definition
 * Represents a category of service providers (e.g., Personal Trainer, Yoga Instructor)
 */
export interface UserTypeDefinition {
  id: string;
  name: string; // e.g., "Personal Trainer"
  slug: string; // e.g., "personal-trainer"
  description: string;
  shortDescription?: string;
  icon: string; // icon name or URL
  category: UserTypeCategory;

  // Provider capabilities
  services: UserTypeService[];

  // Requirements to become this type of provider
  requirements: UserTypeRequirements;

  // Metadata
  isActive: boolean;
  displayOrder: number;
  tags?: string[];
  createdAt: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp | null;
}

/**
 * Provider's assigned user type with their specific settings
 */
export interface ProviderUserTypeAssignment {
  userTypeId: string;
  isVerified: boolean;
  verificationDate?: admin.firestore.Timestamp;
  servicesOffered: string[]; // IDs of services from UserType.services that this provider offers
  customPricing?: Record<
    string,
    {
      amount: number;
      currency: string;
    }
  >;
  certifications: {
    name: string;
    issuingBody: string;
    issueDate: admin.firestore.Timestamp;
    expiryDate?: admin.firestore.Timestamp;
    verificationStatus: "pending" | "verified" | "rejected";
    documentUrl?: string;
  }[];
  yearsExperience: number;
  bio?: string;
  specializations?: string[];
}

/**
 * Subcategory for organizing user types
 */
export interface UserTypeSubcategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentCategory: UserTypeCategory;
  userTypeIds: string[];
  isActive: boolean;
  displayOrder: number;
}

/**
 * Service type that links to user types
 * This represents a specific service offering that can be provided by multiple user types
 */
export interface ServiceType {
  id: string;
  name: string;
  slug: string;
  description: string;

  // Which user types can offer this service
  applicableUserTypeIds: string[];

  // Service configuration
  defaultDuration: number; // in minutes
  durationOptions: number[]; // in minutes
  pricingType: PricingType;

  // Requirements specific to this service
  requirements?: {
    additionalCertifications?: string[];
    minimumExperience?: number;
    equipmentRequired?: string[];
  };

  // Metadata
  isActive: boolean;
  tags: string[];
  createdAt: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp | null;
}
