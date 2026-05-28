import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  UserRole,
  Permission,
  UserType,
  ProviderProfile,
} from "../types";
import {
  requireSuperAdmin,
  requireAdmin,
  getUserRoleInfo,
  isValidRole,
  calculatePermissions,
  getDefaultPermissionsForRole,
  getProviderTypeList,
} from "../utils/roles";
import { writeAuditLog } from "../lib/audit";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

// ============================================
// REQUEST INTERFACES
// ============================================

interface SetUserRoleData {
  userId: string;
  role: UserRole;
  customPermissions?: Permission[];
  reason?: string;
}

interface CreateProviderProfileData {
  email: string;
  fullName: string;
  phone: string;
  userType: UserType;
  providerProfile?: {
    bio?: string;
    specialties?: string[];
    yearsExperience?: number;
    certifications?: string[];
    languages?: string[];
    hourlyRate?: number;
    availabilitySchedule?: Record<string, unknown>;
    serviceArea?: {
      latitude: number;
      longitude: number;
      radiusKm: number;
    };
  };
  sendWelcomeEmail?: boolean;
}

interface UpdateProviderProfileData {
  providerProfile: Partial<Omit<ProviderProfile, "isVerified" | "rating" | "reviewCount">>;
}

interface ListProvidersData {
  userType?: UserType;
  isVerified?: boolean;
  limit?: number;
  offset?: number;
}

interface VerifyProviderData {
  providerId: string;
  verified: boolean;
  notes?: string;
}

// ============================================
// USER ROLE MANAGEMENT
// ============================================

/**
 * Set user role - Superadmin only
 * Can assign any role to any user
 */
export const setUserRole = onCall<SetUserRoleData>(
  { region },
  async (request: CallableRequest<SetUserRoleData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { userId, role, customPermissions, reason } = request.data;

    // Only superadmin can set roles
    try {
      await requireSuperAdmin(callerId);
    } catch (error) {
      throw new HttpsError("permission-denied", "Only superadmin can manage user roles");
    }

    // Validate role
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", `Invalid role: ${role}`);
    }

    // Prevent self-demotion from superadmin
    if (userId === callerId && role !== "superadmin") {
      throw new HttpsError("failed-precondition", "Cannot demote yourself from superadmin");
    }

    // Check if target user exists
    const targetUserDoc = await db.collection("users").doc(userId).get();
    if (!targetUserDoc.exists) {
      throw new HttpsError("not-found", "Target user not found");
    }

    // Calculate permissions based on role
    const permissions = calculatePermissions(role, customPermissions);

    // Update user document
    const updateData: Record<string, unknown> = {
      role,
      permissions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: callerId,
      roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleUpdateReason: reason || null,
    };

    // Clear provider profile if role is not provider
    if (role !== "provider") {
      updateData.userType = admin.firestore.FieldValue.delete();
      updateData.providerProfile = admin.firestore.FieldValue.delete();
    }

    await db.collection("users").doc(userId).update(updateData);

    // Log the role change in audit collection
    await db.collection("roleChangeLogs").add({
      userId,
      previousRole: targetUserDoc.data()?.role || "customer",
      newRole: role,
      changedBy: callerId,
      reason: reason || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      userId,
      role,
      permissions,
    };
  }
);

/**
 * Get current user's permissions
 * Returns role, permissions, and related info for the authenticated user
 */
export const getUserPermissions = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const roleInfo = await getUserRoleInfo(userId);

    if (!roleInfo) {
      throw new HttpsError("not-found", "User not found");
    }

    // Get additional user data
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    return {
      userId,
      role: roleInfo.role,
      permissions: roleInfo.permissions,
      isActive: roleInfo.isActive,
      userType: userData?.userType || null,
      isProvider: roleInfo.role === "provider",
      isAdmin: roleInfo.role === "admin" || roleInfo.role === "superadmin",
      isSuperAdmin: roleInfo.role === "superadmin",
      canAccessAdminPanel: roleInfo.role === "admin" || roleInfo.role === "superadmin",
    };
  }
);

// ============================================
// PROVIDER MANAGEMENT
// ============================================

/**
 * Create a new provider profile
 * Can be called by admin/superadmin to create providers
 * or by a user to apply to become a provider (creates pending provider)
 */
export const createProviderProfile = onCall<CreateProviderProfileData>(
  { region },
  async (request: CallableRequest<CreateProviderProfileData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const callerInfo = await getUserRoleInfo(callerId);

    if (!callerInfo) {
      throw new HttpsError("not-found", "User not found");
    }

    const isStaff = callerInfo.role === "superadmin" || callerInfo.role === "admin";

    // If not staff, user can only create provider profile for themselves
    // This is an "apply to become provider" flow
    if (!isStaff) {
      // Check if user is already a provider
      if (callerInfo.role === "provider") {
        throw new HttpsError("already-exists", "You are already a provider");
      }

      // Non-staff can only apply, they don't set the role directly
      // Create a provider application instead
      const { userType, providerProfile } = request.data;

      await db.collection("providerApplications").add({
        userId: callerId,
        userType,
        providerProfile,
        status: "pending",
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
        notes: null,
      });

      return {
        success: true,
        message: "Provider application submitted for review",
        status: "pending",
      };
    }

    // Staff can directly create provider accounts
    const { email, fullName, phone, userType, providerProfile, sendWelcomeEmail } = request.data;

    // Validate required fields
    if (!email || !fullName || !userType) {
      throw new HttpsError("invalid-argument", "Email, fullName, and userType are required");
    }

    // Validate userType
    const validTypes = getProviderTypeList();
    if (!validTypes.includes(userType)) {
      throw new HttpsError("invalid-argument", `Invalid userType. Valid types: ${validTypes.join(", ")}`);
    }

    // Create Firebase Auth user
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        displayName: fullName,
        phoneNumber: phone || undefined,
      });
    } catch (error) {
      // If user already exists, get the existing user
      if ((error as { code?: string }).code === "auth/email-already-exists") {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        throw new HttpsError("internal", "Failed to create user account");
      }
    }

    const userId = userRecord.uid;

    // Prepare provider profile with defaults
    const completeProviderProfile: ProviderProfile = {
      bio: providerProfile?.bio || "",
      specialties: providerProfile?.specialties || [],
      certifications: providerProfile?.certifications || [],
      yearsExperience: providerProfile?.yearsExperience || 0,
      languages: providerProfile?.languages || ["it"],
      isVerified: false, // New providers start unverified
      rating: 0,
      reviewCount: 0,
      hourlyRate: providerProfile?.hourlyRate,
      availabilitySchedule: providerProfile?.availabilitySchedule,
      serviceArea: providerProfile?.serviceArea,
    };

    // Create user document
    const now = admin.firestore.FieldValue.serverTimestamp();
    const userData = {
      uid: userId,
      email,
      phone: phone || "",
      fullName,
      avatarUrl: userRecord.photoURL || null,

      // Role and type
      role: "provider" as UserRole,
      userType,
      permissions: getDefaultPermissionsForRole("provider"),

      // Provider profile
      providerProfile: completeProviderProfile,

      // Status
      isActive: true,
      isVip: false,
      isVerified: false,

      // VIP Status
      vipExpiresAt: null,
      vipPlanId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,

      // Balances
      pointsBalance: 0,
      walletBalance: 0,

      // Preferences
      preferredLanguage: "it",
      preferredSection: "fit",

      // Push tokens
      fcmTokens: [],

      // Referral
      referralCode: `VFIT${userId.substring(0, 6).toUpperCase()}`,
      referredBy: null,
      referralCount: 0,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,

      // Metadata
      createdBy: callerId,
    };

    await db.collection("users").doc(userId).set(userData);

    // Send welcome email if requested
    if (sendWelcomeEmail) {
      // TODO: Implement email sending via Firebase Extensions or Cloud Function
      console.log(`Welcome email would be sent to ${email}`);
    }

    return {
      success: true,
      userId,
      role: "provider",
      message: "Provider account created successfully",
    };
  }
);

/**
 * Update own provider profile
 * Providers can update their own profile information
 */
export const updateProviderProfile = onCall<UpdateProviderProfileData>(
  { region },
  async (request: CallableRequest<UpdateProviderProfileData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const callerInfo = await getUserRoleInfo(userId);

    if (!callerInfo) {
      throw new HttpsError("not-found", "User not found");
    }

    // Only providers can update their own provider profile
    if (callerInfo.role !== "provider") {
      throw new HttpsError("permission-denied", "Only providers can update provider profiles");
    }

    const { providerProfile } = request.data;
    const userDoc = await db.collection("users").doc(userId).get();
    const currentData = userDoc.data();

    if (!currentData) {
      throw new HttpsError("not-found", "User data not found");
    }

    // Merge with existing profile, preserving system-managed fields
    const currentProfileData = currentData.providerProfile || {};
    const updatedProfile = {
      ...currentProfileData,
      ...providerProfile,
      // Preserve system-managed fields
      isVerified: currentProfileData.isVerified || false,
      rating: currentProfileData.rating || 0,
      reviewCount: currentProfileData.reviewCount || 0,
    };

    await db.collection("users").doc(userId).update({
      providerProfile: updatedProfile,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: "Provider profile updated successfully",
    };
  }
);

/**
 * Verify or unverify a provider
 * Admin/Superadmin only
 */
export const verifyProvider = onCall<VerifyProviderData>(
  { region },
  async (request: CallableRequest<VerifyProviderData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;

    // Only staff can verify providers
    try {
      await requireAdmin(callerId);
    } catch (error) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { providerId, verified, notes } = request.data;

    const providerDoc = await db.collection("users").doc(providerId).get();
    if (!providerDoc.exists) {
      throw new HttpsError("not-found", "Provider not found");
    }

    const providerData = providerDoc.data();
    if (providerData?.role !== "provider") {
      throw new HttpsError("invalid-argument", "User is not a provider");
    }

    // Update verification status
    await db.collection("users").doc(providerId).update({
      "providerProfile.isVerified": verified,
      "isVerified": verified,
      "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
      "verificationNotes": notes || null,
      "verifiedBy": callerId,
      "verifiedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log verification action
    await db.collection("verificationLogs").add({
      providerId,
      verified,
      verifiedBy: callerId,
      notes: notes || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      providerId,
      verified,
      message: `Provider ${verified ? "verified" : "unverified"} successfully`,
    };
  }
);

// ============================================
// PROVIDER LISTING
// ============================================

/**
 * List providers by type
 * Public endpoint - anyone can list verified providers
 * Staff can list all providers including unverified
 */
export const listProviders = onCall<ListProvidersData>(
  { region },
  async (request: CallableRequest<ListProvidersData>) => {
    const { userType, isVerified, limit = 20, offset = 0 } = request.data || {};

    let isStaff = false;
    if (request.auth) {
      const callerInfo = await getUserRoleInfo(request.auth.uid);
      isStaff = callerInfo?.role === "superadmin" || callerInfo?.role === "admin";
    }

    // Build query
    let query: admin.firestore.Query = db
      .collection("users")
      .where("role", "==", "provider")
      .orderBy("createdAt", "desc");

    // Filter by userType if provided
    if (userType) {
      query = query.where("userType", "==", userType);
    }

    // Non-staff can only see verified providers
    if (!isStaff) {
      query = query.where("providerProfile.isVerified", "==", true);
    } else if (isVerified !== undefined) {
      // Staff can filter by verification status
      query = query.where("providerProfile.isVerified", "==", isVerified);
    }

    // Execute query with pagination
    const snapshot = await query.limit(limit).offset(offset).get();

    const providers = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        userType: data.userType,
        providerProfile: {
          bio: data.providerProfile?.bio,
          specialties: data.providerProfile?.specialties,
          yearsExperience: data.providerProfile?.yearsExperience,
          languages: data.providerProfile?.languages,
          isVerified: data.providerProfile?.isVerified,
          rating: data.providerProfile?.rating,
          reviewCount: data.providerProfile?.reviewCount,
          hourlyRate: data.providerProfile?.hourlyRate,
        },
        avatarUrl: data.avatarUrl,
        createdAt: data.createdAt,
        // Only include these for staff
        ...(isStaff && {
          isActive: data.isActive,
          isVerified: data.isVerified,
          walletBalance: data.walletBalance,
        }),
      };
    });

    // Get total count for pagination
    const countSnapshot = await query.count().get();

    return {
      providers,
      pagination: {
        total: countSnapshot.data().count,
        limit,
        offset,
        hasMore: providers.length === limit,
      },
    };
  }
);

/**
 * Get available provider types/categories
 * Public endpoint
 */
export const listProviderTypes = onCall(
  { region },
  async () => {
    const types = [
      { value: "trainer", label: "Trainer", labelIt: "Allenatore" },
      { value: "hairstylist", label: "Hairstylist", labelIt: "Parrucchiere" },
      { value: "yoga_teacher", label: "Yoga Teacher", labelIt: "Insegnante di Yoga" },
      { value: "psychologist", label: "Psychologist", labelIt: "Psicologo" },
      { value: "pronunciation_coach", label: "Pronunciation Coach", labelIt: "Coach di Pronuncia" },
      { value: "nutritionist", label: "Nutritionist", labelIt: "Nutrizionista" },
      { value: "massage_therapist", label: "Massage Therapist", labelIt: "Massaggiatore" },
      { value: "personal_trainer", label: "Personal Trainer", labelIt: "Personal Trainer" },
      { value: "pilates_instructor", label: "Pilates Instructor", labelIt: "Istruttore Pilates" },
      { value: "dance_instructor", label: "Dance Instructor", labelIt: "Istruttore di Danza" },
      { value: "other", label: "Other", labelIt: "Altro" },
    ];

    return { types };
  }
);

// ============================================
// ADMIN USER MANAGEMENT
// ============================================

/**
 * List all users with role info
 * Admin/Superadmin only
 */
export const listUsers = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;

    try {
      await requireAdmin(callerId);
    } catch (error) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { role, limit = 50, offset = 0 } = request.data as { role?: UserRole; limit?: number; offset?: number };

    let query: admin.firestore.Query = db.collection("users").orderBy("createdAt", "desc");

    if (role) {
      query = query.where("role", "==", role);
    }

    const snapshot = await query.limit(limit).offset(offset).get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        userType: data.userType,
        isActive: data.isActive,
        isVerified: data.isVerified,
        isVip: data.isVip,
        createdAt: data.createdAt,
        lastLoginAt: data.lastLoginAt,
      };
    });

    return { users };
  }
);

/**
 * Deactivate/Activate a user account
 * Admin/Superadmin only
 * Superadmin cannot be deactivated by non-superadmin
 */
export const setUserActiveStatus = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    const { userId, isActive, reason } = request.data as { userId: string; isActive: boolean; reason?: string };

    const callerInfo = await getUserRoleInfo(callerId);

    if (!callerInfo || (callerInfo.role !== "admin" && callerInfo.role !== "superadmin")) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const targetUserDoc = await db.collection("users").doc(userId).get();
    if (!targetUserDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const targetUserData = targetUserDoc.data();

    // Non-superadmin cannot modify superadmin accounts
    if (targetUserData?.role === "superadmin" && callerInfo.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Cannot modify superadmin accounts");
    }

    // Cannot deactivate yourself
    if (userId === callerId) {
      throw new HttpsError("failed-precondition", "Cannot deactivate your own account");
    }

    await db.collection("users").doc(userId).update({
      isActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusChangedBy: callerId,
      statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusChangeReason: reason || null,
    });

    // Log the action
    await db.collection("userStatusLogs").add({
      userId,
      isActive,
      changedBy: callerId,
      reason: reason || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      userId,
      isActive,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
    };
  }
);

/**
 * Superadmin-only: "delete" a provider by demoting them back to customer and
 * clearing provider-specific fields. We preserve the user doc so booking/review
 * history remains queryable. Writes an audit_logs entry capturing the previous state.
 */
export const adminDeleteProvider = onCall<{ providerId: string; reason: string }>(
  { region },
  async (req: CallableRequest<{ providerId: string; reason: string }>) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    const caller = callerSnap.data();
    if (caller?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    const { providerId, reason } = req.data;
    if (!providerId || !reason) {
      throw new HttpsError("invalid-argument", "providerId and reason required");
    }

    // Providers live in the `users` collection with role='provider'.
    // Demote rather than delete so audit history is preserved.
    const provSnap = await db.collection("users").doc(providerId).get();
    if (!provSnap.exists) {
      throw new HttpsError("not-found", "Provider not found");
    }
    const before = provSnap.data();
    if (before?.role !== "provider") {
      throw new HttpsError("failed-precondition", "Target is not a provider");
    }

    await db.collection("users").doc(providerId).update({
      role: "customer",
      providerProfile: admin.firestore.FieldValue.delete(),
      providerStatus: "removed",
      userType: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: caller?.email ?? "",
      actorRole: "superadmin",
      action: "delete",
      entityType: "provider",
      entityId: providerId,
      before,
      reason,
    });

    return { ok: true };
  }
);
