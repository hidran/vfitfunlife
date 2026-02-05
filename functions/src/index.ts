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
