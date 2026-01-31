import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  userTypesSeedData,
  UserTypeSeedData,
  UserTypeCategory,
} from "../seed/userTypes";
import { checkIsAdmin } from "../utils/roles";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

interface SeedUserTypesData {
  force?: boolean;
}

interface GetUserTypeData {
  id: string;
}

interface UpdateUserTypeData {
  id: string;
  updates: Partial<UserTypeSeedData>;
}

/**
 * Seed user types into Firestore
 * Admin only function
 */
export const seedUserTypes = onCall<SeedUserTypesData>(
  { region },
  async (request: CallableRequest<SeedUserTypesData>) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    // Check admin status
    const userIsAdmin = await checkIsAdmin(request.auth.uid);
    if (!userIsAdmin) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { force = false } = request.data;

    try {
      const batch = db.batch();
      const userTypesRef = db.collection("userTypes");
      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[],
      };

      for (const userType of userTypesSeedData) {
        const docRef = userTypesRef.doc(userType.id);
        const existingDoc = await docRef.get();

        if (existingDoc.exists && !force) {
          results.skipped++;
          continue;
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const data = {
          ...userType,
          createdAt: existingDoc.exists ?
            existingDoc.data()?.createdAt || now :
            now,
          updatedAt: now,
        };

        batch.set(docRef, data, { merge: true });

        if (existingDoc.exists) {
          results.updated++;
        } else {
          results.created++;
        }
      }

      await batch.commit();

      return {
        success: true,
        message: `User types seeded: ${results.created} created, ` +
          `${results.updated} updated, ${results.skipped} skipped`,
        results,
      };
    } catch (error) {
      console.error("Error seeding user types:", error);
      throw new HttpsError(
        "internal",
        "Failed to seed user types",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);

/**
 * Get all user types
 * Public function - no authentication required
 */
export const getUserTypes = onCall(
  { region },
  async (request: CallableRequest) => {
    try {
      const { category, activeOnly = true } = request.data as {
        category?: UserTypeCategory;
        activeOnly?: boolean;
      };

      let query: admin.firestore.Query = db.collection("userTypes");

      if (category) {
        query = query.where("category", "==", category);
      }

      if (activeOnly) {
        query = query.where("isActive", "==", true);
      }

      // Order by display order
      query = query.orderBy("displayOrder", "asc");

      const snapshot = await query.get();

      const userTypes = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          slug: data.slug,
          description: data.description,
          shortDescription: data.shortDescription,
          icon: data.icon,
          category: data.category,
          services: data.services,
          requirements: data.requirements,
          isActive: data.isActive,
          displayOrder: data.displayOrder,
          tags: data.tags,
          createdAt: data.createdAt?.toMillis(),
          updatedAt: data.updatedAt?.toMillis(),
        };
      });

      return {
        success: true,
        count: userTypes.length,
        userTypes,
      };
    } catch (error) {
      console.error("Error getting user types:", error);
      throw new HttpsError(
        "internal",
        "Failed to get user types",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);

/**
 * Get a specific user type by ID
 * Public function - no authentication required
 */
export const getUserType = onCall<GetUserTypeData>(
  { region },
  async (request: CallableRequest<GetUserTypeData>) => {
    const { id } = request.data;

    if (!id) {
      throw new HttpsError("invalid-argument", "User type ID is required");
    }

    try {
      const docRef = db.collection("userTypes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new HttpsError("not-found", `User type '${id}' not found`);
      }

      const data = doc.data();

      return {
        success: true,
        userType: {
          id: doc.id,
          name: data?.name,
          slug: data?.slug,
          description: data?.description,
          shortDescription: data?.shortDescription,
          icon: data?.icon,
          category: data?.category,
          services: data?.services,
          requirements: data?.requirements,
          isActive: data?.isActive,
          displayOrder: data?.displayOrder,
          tags: data?.tags,
          createdAt: data?.createdAt?.toMillis(),
          updatedAt: data?.updatedAt?.toMillis(),
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("Error getting user type:", error);
      throw new HttpsError(
        "internal",
        "Failed to get user type",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);

/**
 * Update a user type
 * Admin only function
 */
export const updateUserType = onCall<UpdateUserTypeData>(
  { region },
  async (request: CallableRequest<UpdateUserTypeData>) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    // Check admin status
    const userIsAdmin = await checkIsAdmin(request.auth.uid);
    if (!userIsAdmin) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { id, updates } = request.data;

    if (!id) {
      throw new HttpsError("invalid-argument", "User type ID is required");
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new HttpsError("invalid-argument", "No updates provided");
    }

    // Define allowed fields for update
    const allowedFields = [
      "name",
      "slug",
      "description",
      "shortDescription",
      "icon",
      "category",
      "services",
      "requirements",
      "isActive",
      "displayOrder",
      "tags",
    ];

    // Filter updates to only allow valid fields
    const filteredUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field as keyof typeof updates] !== undefined) {
        filteredUpdates[field] = updates[field as keyof typeof updates];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new HttpsError("invalid-argument", "No valid fields to update");
    }

    try {
      const docRef = db.collection("userTypes").doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new HttpsError("not-found", `User type '${id}' not found`);
      }

      filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await docRef.update(filteredUpdates);

      return {
        success: true,
        message: `User type '${id}' updated successfully`,
        updatedFields: Object.keys(filteredUpdates).filter(
          (f) => f !== "updatedAt"
        ),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("Error updating user type:", error);
      throw new HttpsError(
        "internal",
        "Failed to update user type",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);

/**
 * Get user types by category
 * Public function - no authentication required
 */
export const getUserTypesByCategory = onCall(
  { region },
  async (request: CallableRequest) => {
    const { category } = request.data as { category?: UserTypeCategory };

    if (!category) {
      throw new HttpsError("invalid-argument", "Category is required");
    }

    try {
      const snapshot = await db
        .collection("userTypes")
        .where("category", "==", category)
        .where("isActive", "==", true)
        .orderBy("displayOrder", "asc")
        .get();

      const userTypes = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          slug: data.slug,
          description: data.description,
          shortDescription: data.shortDescription,
          icon: data.icon,
          category: data.category,
          services: data.services,
          requirements: data.requirements,
          isActive: data.isActive,
          displayOrder: data.displayOrder,
          tags: data.tags,
          createdAt: data.createdAt?.toMillis(),
          updatedAt: data.updatedAt?.toMillis(),
        };
      });

      return {
        success: true,
        category,
        count: userTypes.length,
        userTypes,
      };
    } catch (error) {
      console.error("Error getting user types by category:", error);
      throw new HttpsError(
        "internal",
        "Failed to get user types by category",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);
