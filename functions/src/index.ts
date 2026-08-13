import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Export all function modules
export * from "./auth";
export * from "./bookings";
export * from "./payments";
export * from "./notifications";
export * from "./users";
export * from "./scheduled";
export * from "./seed/seedData";
export * from "./ai/migrateInstructors";
export * from "./ai/chat";
export * from "./ai/admin";
export * from "./ai/authoring/generate";
export * from "./ai/authoring/admin";
export * from "./metrics";
export * from "./leads";
export * from "./ai/authoring/generateWorkoutPlan";
export * from "./exercises/seed";
export * from "./recipes/generateRecipes";
export * from "./recipes/purgeLegacyNutrition";
export * from "./providers/onServiceWrite";
export * from "./providers/backfillProviderStatus";
export * from "./users/migrateAudit";
export * from "./config/pilotFlags";
