#!/usr/bin/env ts-node
/**
 * Firestore Seed Script for User Types
 * 
 * This script populates the userTypes collection in Firestore
 * with the predefined user type data.
 * 
 * Usage:
 *   npx ts-node scripts/seed-user-types.ts
 * 
 * Environment variables:
 *   - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON file
 *   - FIREBASE_PROJECT_ID: Firebase project ID (optional if using service account)
 *   - FORCE_UPDATE: Set to 'true' to update existing documents (default: false)
 */

import * as admin from "firebase-admin";
import { userTypesSeedData, UserTypeSeedData } from "../functions/src/seed/userTypes";

// Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID;
const forceUpdate = process.env.FORCE_UPDATE === "true";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: projectId,
  });
}

const db = admin.firestore();

interface SeedResults {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Seed user types into Firestore
 */
async function seedUserTypes(): Promise<SeedResults> {
  const results: SeedResults = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const batch = db.batch();
  const userTypesRef = db.collection("userTypes");

  console.log(`\n🌱 Starting user types seeding...`);
  console.log(`   Force update: ${forceUpdate ? "YES" : "NO"}`);
  console.log(`   Total types to seed: ${userTypesSeedData.length}\n`);

  for (const userType of userTypesSeedData) {
    try {
      const docRef = userTypesRef.doc(userType.id);
      const existingDoc = await docRef.get();

      if (existingDoc.exists && !forceUpdate) {
        console.log(`  ⏭️  Skipped: ${userType.name} (${userType.id})`);
        results.skipped++;
        continue;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const data: UserTypeSeedData & {
        createdAt: admin.firestore.FieldValue;
        updatedAt: admin.firestore.FieldValue;
      } = {
        ...userType,
        createdAt: existingDoc.exists
          ? (existingDoc.data()?.createdAt as admin.firestore.Timestamp) || now
          : now,
        updatedAt: now,
      };

      batch.set(docRef, data, { merge: true });

      if (existingDoc.exists) {
        console.log(`  🔄 Updated: ${userType.name} (${userType.id})`);
        results.updated++;
      } else {
        console.log(`  ✅ Created: ${userType.name} (${userType.id})`);
        results.created++;
      }
    } catch (error) {
      const errorMsg = `Error processing ${userType.id}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      console.error(`  ❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  // Commit the batch
  try {
    await batch.commit();
    console.log("\n💾 Batch committed successfully!");
  } catch (error) {
    const errorMsg = `Batch commit failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    console.error(`\n  ❌ ${errorMsg}`);
    results.errors.push(errorMsg);
  }

  return results;
}

/**
 * Verify seeded data
 */
async function verifySeeding(): Promise<void> {
  console.log("\n🔍 Verifying seeded data...\n");

  const snapshot = await db.collection("userTypes").get();
  console.log(`   Total documents in userTypes: ${snapshot.size}`);

  // Group by category
  const byCategory: Record<string, string[]> = {};
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const category = data.category || "uncategorized";
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(data.name);
  });

  console.log("\n   By Category:");
  for (const [category, names] of Object.entries(byCategory)) {
    console.log(`   - ${category}: ${names.join(", ")}`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log("============================================");
  console.log("   VFit User Types Seeding Script");
  console.log("============================================");

  try {
    const results = await seedUserTypes();

    console.log("\n--------------------------------------------");
    console.log("   Seeding Summary");
    console.log("--------------------------------------------");
    console.log(`   ✅ Created:  ${results.created}`);
    console.log(`   🔄 Updated:  ${results.updated}`);
    console.log(`   ⏭️  Skipped:  ${results.skipped}`);
    console.log(`   ❌ Errors:   ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log("\n   Errors:");
      results.errors.forEach((err) => console.log(`     - ${err}`));
    }

    // Verify seeding
    await verifySeeding();

    console.log("\n============================================");
    console.log("   Seeding completed successfully! 🎉");
    console.log("============================================\n");

    process.exit(0);
  } catch (error) {
    console.error("\n============================================");
    console.error("   Seeding failed! 💥");
    console.error("============================================");
    console.error(
      "Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

// Run the script
main();
