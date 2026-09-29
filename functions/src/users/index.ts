import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getUserRoleInfo } from "../utils/roles";

const db = admin.firestore();
import { region } from "../lib/runtimeOptions";

// Re-export all role management functions
export * from "./roles";

// Export user type functions
export * from "./userTypes";

// Export profile functions
export * from "./profile";

// Export gamification functions
export * from "./gamification";

// Export check-in callable
export * from "./checkin";

// Export Season 0 onboarding reward callables
export * from "./season0Rewards";

// Export family callables
export * from "./family";

// Export admin-only mutation functions (superadmin-gated)
export * from "./adminMutations";
export * from "./bulkDelete";

// Review callable (one review per delivered booking)
export * from "./reviews";

interface UserUpdateData {
  fullName?: string;
  dateOfBirth?: string;
  preferredLanguage?: string;
  preferredSection?: string;
  notificationsEnabled?: boolean;
  [key: string]: unknown;
}

interface AddressData {
  addressId?: string;
  address: {
    label: string;
    street: string;
    streetNumber: string;
    city: string;
    postalCode: string;
    province: string;
    country?: string;
    latitude: number;
    longitude: number;
    geohash: string;
    isDefault?: boolean;
  };
}

interface DeleteAddressData {
  addressId: string;
}

interface LeaderboardData {
  type?: string;
  limit?: number;
}

/**
 * Update user profile
 * Users can only update their own profile
 * Providers have additional fields they can update
 */
export const updateProfile = onCall<UserUpdateData>(
  { region },
  async (request: CallableRequest<UserUpdateData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const data = request.data;

    // Get user role info to determine allowed fields
    const roleInfo = await getUserRoleInfo(userId);

    // Base allowed fields for all users
    const baseAllowedFields = [
      "fullName",
      "dateOfBirth",
      "preferredLanguage",
      "preferredSection",
      "avatarUrl",
      // Season 0 gamification fields (client-writable, validated below)
      "interests",
      "homeCity",
      "phone",
    ];

    // Additional fields providers can update (in their main profile, not providerProfile)
    const providerAllowedFields = [
      ...baseAllowedFields,
      "phone", // Providers can update their contact phone
    ];

    const allowedFields = roleInfo?.role === "provider" ? providerAllowedFields : baseAllowedFields;

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpsError("invalid-argument", "No valid fields to update");
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("users").doc(userId).update(updates);

    return { success: true };
  }
);

/**
 * Get user stats
 * Users can view their own stats
 * Providers can view their own provider stats
 * Admins can view any user's stats
 */
export const getUserStats = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const callerId = request.auth.uid;
    // The client calls this with no payload, so request.data is null.
    const targetUserId = (request.data as { userId?: string } | null)?.userId || callerId;

    // Check permissions
    const callerInfo = await getUserRoleInfo(callerId);

    // Users can only view their own stats unless they're admin
    if (targetUserId !== callerId) {
      if (!callerInfo || (callerInfo.role !== "admin" && callerInfo.role !== "superadmin")) {
        throw new HttpsError("permission-denied", "Can only view your own stats");
      }
    }

    // Get completed bookings count
    const completedBookings = await db
      .collection("bookings")
      .where("userId", "==", targetUserId)
      .where("status", "==", "completed")
      .count()
      .get();

    // Get total points earned
    const pointsEarned = await db
      .collection("users")
      .doc(targetUserId)
      .collection("pointsTransactions")
      .where("type", "==", "earned")
      .get();

    const totalPointsEarned = pointsEarned.docs.reduce((sum, doc) => sum + doc.data().points, 0);

    // Get reviews count
    const reviewsWritten = await db
      .collection("venues")
      .doc()
      .collection("reviews")
      .where("userId", "==", targetUserId)
      .count()
      .get();

    // Get active challenges
    const activeChallenges = await db
      .collection("users")
      .doc(targetUserId)
      .collection("userChallenges")
      .where("status", "==", "in_progress")
      .count()
      .get();

    // Get referrals count
    const userDoc = await db.collection("users").doc(targetUserId).get();
    const userData = userDoc.data();

    const stats: Record<string, unknown> = {
      completedBookings: completedBookings.data().count,
      totalPointsEarned,
      reviewsWritten: reviewsWritten.data().count,
      activeChallenges: activeChallenges.data().count,
      referralCount: userData?.referralCount || 0,
    };

    // Add provider-specific stats if the target user is a provider
    if (userData?.role === "provider") {
      // Get bookings as provider (using instructorId)
      const providerBookings = await db
        .collection("bookings")
        .where("instructorId", "==", targetUserId)
        .count()
        .get();

      const completedProviderBookings = await db
        .collection("bookings")
        .where("instructorId", "==", targetUserId)
        .where("status", "==", "completed")
        .count()
        .get();

      const totalEarnings = await db
        .collection("bookings")
        .where("instructorId", "==", targetUserId)
        .where("status", "==", "completed")
        .get();

      const earnings = totalEarnings.docs.reduce((sum, doc) => {
        const booking = doc.data();
        return sum + (booking.providerEarnings || 0);
      }, 0);

      stats.providerStats = {
        totalBookings: providerBookings.data().count,
        completedBookings: completedProviderBookings.data().count,
        totalEarnings: earnings,
        rating: userData.providerProfile?.rating || 0,
        reviewCount: userData.providerProfile?.reviewCount || 0,
      };
    }

    return stats;
  }
);

/**
 * Add or update user address
 */
export const saveAddress = onCall<AddressData>(
  { region },
  async (request: CallableRequest<AddressData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { addressId, address } = request.data;

    const addressData = {
      label: address.label,
      street: address.street,
      streetNumber: address.streetNumber,
      city: address.city,
      postalCode: address.postalCode,
      province: address.province,
      country: address.country || "Italia",
      location: new admin.firestore.GeoPoint(address.latitude, address.longitude),
      geohash: address.geohash,
      isDefault: address.isDefault || false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // If setting as default, unset other defaults
    if (address.isDefault) {
      const existingDefaults = await db
        .collection("users")
        .doc(userId)
        .collection("addresses")
        .where("isDefault", "==", true)
        .get();

      const batch = db.batch();
      existingDefaults.docs.forEach((doc) => {
        batch.update(doc.ref, { isDefault: false });
      });
      await batch.commit();
    }

    if (addressId) {
      await db
        .collection("users")
        .doc(userId)
        .collection("addresses")
        .doc(addressId)
        .update(addressData);
      return { addressId };
    } else {
      const newRef = await db
        .collection("users")
        .doc(userId)
        .collection("addresses")
        .add(addressData);
      return { addressId: newRef.id };
    }
  }
);

/**
 * Delete user address
 */
export const deleteAddress = onCall<DeleteAddressData>(
  { region },
  async (request: CallableRequest<DeleteAddressData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const { addressId } = request.data;

    await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .doc(addressId)
      .delete();

    return { success: true };
  }
);

/**
 * Get leaderboard
 * Public endpoint - anyone can view
 */
export const getLeaderboard = onCall<LeaderboardData>(
  { region },
  async (request: CallableRequest<LeaderboardData>) => {
    // Allow unauthenticated access to leaderboard
    const { type = "points", limit = 10 } = request.data;

    let query;

    if (type === "points") {
      query = db
        .collection("users")
        .orderBy("pointsBalance", "desc")
        .limit(limit);
    } else if (type === "bookings") {
      // This would need a counter field on user document
      query = db
        .collection("users")
        .orderBy("totalBookings", "desc")
        .limit(limit);
    } else {
      throw new HttpsError("invalid-argument", "Invalid leaderboard type");
    }

    const snapshot = await query.get();

    const leaderboard = snapshot.docs.map((doc, index) => {
      const userData = doc.data();
      return {
        rank: index + 1,
        userId: doc.id,
        fullName: userData.fullName,
        avatarUrl: userData.avatarUrl,
        value: type === "points" ? userData.pointsBalance : userData.totalBookings,
        isVip: userData.isVip,
      };
    });

    return { leaderboard };
  }
);
