import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  UserRole,
  Permission,
  UserType,
  ProviderProfile,
} from "../types";
import {
  requireAdmin,
  getUserRoleInfo,
  isValidRole,
  calculatePermissions,
  getDefaultPermissionsForRole,
  getProviderTypeList,
} from "../utils/roles";
import { writeAuditLog, toActorRole } from "../lib/audit";
import { seedProviderServicesFromTemplates } from "../providers/seedProviderServices";
import { mayHoldSuperadmin, isProtectedSuperadmin } from "../lib/superadmins";

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

    // Managing roles is back-office work, so admins do it. What stays superadmin-only is
    // anything touching the superadmin role itself — granting it, or taking it away — which
    // is enforced below once we know the target's current role.
    try {
      await requireAdmin(callerId);
    } catch (error) {
      throw new HttpsError("permission-denied", "Only an admin can manage user roles");
    }

    // Fetch caller info for audit log
    const callerSnap = await db.collection("users").doc(callerId).get();
    const caller = callerSnap.data();
    const callerIsSuperadmin = caller?.role === "superadmin";

    // Validate role
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", `Invalid role: ${role}`);
    }

    // Nobody talks themselves out of their own access: an admin cannot drop their own role
    // any more than a superadmin can. Someone else with the authority has to do it, which
    // also keeps the last admin from locking the back office by accident.
    if (userId === callerId && role !== caller?.role) {
      throw new HttpsError("failed-precondition", "Cannot change your own role");
    }

    // Check if target user exists
    const targetUserDoc = await db.collection("users").doc(userId).get();
    if (!targetUserDoc.exists) {
      throw new HttpsError("not-found", "Target user not found");
    }
    const targetUserData = targetUserDoc.data();

    // A protected superadmin's role can never be changed through the app — not by an
    // admin, and not by the other superadmin. This also blocks a superadmin "changing"
    // their own role back to superadmin through this callable: the only role mutation
    // path is here, and it must stay off-limits for these two accounts entirely.
    if (isProtectedSuperadmin(targetUserData)) {
      throw new HttpsError("permission-denied", "Superadmin accounts cannot be modified");
    }

    // Only the two designated accounts may ever hold role 'superadmin'.
    if (role === "superadmin" && !mayHoldSuperadmin(userId)) {
      throw new HttpsError("permission-denied", "Only the designated superadmin accounts may hold that role");
    }

    // Admins manage customers, providers and each other — not superadmins. Both directions
    // are closed: an admin can neither hand out the superadmin role nor strip it from a
    // superadmin who is not on the protected list (the staging one, for instance). Without
    // the second half, "admin can change roles" would quietly make every admin a superadmin
    // by way of demoting the real one.
    if (!callerIsSuperadmin && (role === "superadmin" || targetUserData?.role === "superadmin")) {
      throw new HttpsError("permission-denied", "Only a superadmin can grant or remove the superadmin role");
    }

    // Calculate permissions based on role
    const permissions = calculatePermissions(role, customPermissions);

    // Update user document
    const updateData: Record<string, unknown> = {
      role,
      permissions,
      updatedAt: FieldValue.serverTimestamp(),
      roleUpdatedBy: callerId,
      roleUpdatedAt: FieldValue.serverTimestamp(),
      roleUpdateReason: reason || null,
    };

    // Clear provider profile if role is not provider
    if (role !== "provider") {
      updateData.userType = FieldValue.delete();
      updateData.providerProfile = FieldValue.delete();
    }

    await db.collection("users").doc(userId).update(updateData);

    // Log the role change in audit collection
    await db.collection("roleChangeLogs").add({
      userId,
      previousRole: targetUserDoc.data()?.role || "customer",
      newRole: role,
      changedBy: callerId,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Write to audit_logs collection
    await writeAuditLog({
      actorUid: callerId,
      actorEmail: caller?.email ?? "",
      // The caller's real role, not a constant: admins can make this change now, and an
      // audit trail that says "superadmin" for every role change answers the wrong question.
      actorRole: toActorRole(caller?.role),
      action: "role_change",
      entityType: "user",
      entityId: userId,
      before: { role: targetUserDoc.data()?.role || "customer" },
      after: { role },
      ...(reason ? { reason } : {}),
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
        submittedAt: FieldValue.serverTimestamp(),
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

    // getUserByEmail above can resolve to an EXISTING Auth account — including, if a
    // protected superadmin's own email is passed in, their own uid. The `.set()` below
    // fully overwrites that uid's user doc with a fresh provider profile, so this must be
    // refused before it ever gets there.
    const existingTargetDoc = await db.collection("users").doc(userId).get();
    if (isProtectedSuperadmin(existingTargetDoc.data())) {
      throw new HttpsError("permission-denied", "Cannot overwrite a protected superadmin account");
    }

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
    const now = FieldValue.serverTimestamp();
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
      updatedAt: FieldValue.serverTimestamp(),
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

    // Fetch caller info for audit log
    const callerSnap = await db.collection("users").doc(callerId).get();
    const caller = callerSnap.data();
    const callerRole = (caller?.role === "superadmin" ? "superadmin" : "admin") as "admin" | "superadmin";

    const { providerId, verified, notes } = request.data;

    const providerDoc = await db.collection("users").doc(providerId).get();
    if (!providerDoc.exists) {
      throw new HttpsError("not-found", "Provider not found");
    }

    const providerData = providerDoc.data();
    if (providerData?.role !== "provider") {
      throw new HttpsError("invalid-argument", "User is not a provider");
    }

    const previousVerified = providerData?.providerProfile?.isVerified ?? providerData?.isVerified ?? false;

    // Update verification status
    await db.collection("users").doc(providerId).update({
      "providerProfile.isVerified": verified,
      "isVerified": verified,
      "updatedAt": FieldValue.serverTimestamp(),
      "verificationNotes": notes || null,
      "verifiedBy": callerId,
      "verifiedAt": FieldValue.serverTimestamp(),
    });

    // Log verification action
    await db.collection("verificationLogs").add({
      providerId,
      verified,
      verifiedBy: callerId,
      notes: notes || null,
      timestamp: FieldValue.serverTimestamp(),
    });

    // On approval, give the provider a starting point instead of an empty services page.
    // Drafts are inactive and unpriced, so nothing becomes bookable without their input.
    if (verified) {
      await seedProviderServicesFromTemplates(providerId, providerData?.userType as string | undefined);
    }

    // Write to audit_logs collection
    await writeAuditLog({
      actorUid: callerId,
      actorEmail: caller?.email ?? "",
      actorRole: callerRole,
      action: "verify",
      entityType: "provider",
      entityId: providerId,
      before: { verified: previousVerified },
      after: { verified },
      ...(notes ? { reason: notes } : {}),
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

    // A protected superadmin's status can never be changed through the app — not by an
    // admin, and not by the other superadmin.
    if (isProtectedSuperadmin(targetUserData)) {
      throw new HttpsError("permission-denied", "Superadmin accounts cannot be modified");
    }

    // Cannot deactivate yourself
    if (userId === callerId) {
      throw new HttpsError("failed-precondition", "Cannot deactivate your own account");
    }

    const previousIsActive = targetUserData?.isActive ?? true;

    await db.collection("users").doc(userId).update({
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
      statusChangedBy: callerId,
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangeReason: reason || null,
    });

    // Log the action
    await db.collection("userStatusLogs").add({
      userId,
      isActive,
      changedBy: callerId,
      reason: reason || null,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Write to audit_logs collection
    // isActive=false means user is being suspended; isActive=true means user is being activated
    const callerRole = (callerInfo.role === "superadmin" ? "superadmin" : "admin") as "admin" | "superadmin";
    const callerSnap = await db.collection("users").doc(callerId).get();
    const caller = callerSnap.data();
    await writeAuditLog({
      actorUid: callerId,
      actorEmail: caller?.email ?? "",
      actorRole: callerRole,
      action: isActive ? "activate" : "suspend",
      entityType: "user",
      entityId: userId,
      before: { isSuspended: !previousIsActive },
      after: { isSuspended: !isActive },
      ...(reason ? { reason } : {}),
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
      providerProfile: FieldValue.delete(),
      providerStatus: "removed",
      userType: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
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
