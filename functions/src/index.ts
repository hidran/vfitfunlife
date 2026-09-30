// MUST be the very first import: setGlobalOptions() has to run before any of
// the `export * from "./<module>"` statements below load a function
// definition (onCall/onRequest/onSchedule/etc. all read the global options
// synchronously at module-load time). Because `module: "commonjs"` preserves
// import order as `require()` order, keeping this import first guarantees
// that ordering. See lib/globalOptions.ts for details.
import "./lib/globalOptions";

import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Export all function modules
export * from "./auth";
export * from "./bookings";
export * from "./bookings/clientRoster";
export * from "./bookings/trainerBooking";
export * from "./bookings/addClientByEmail";
export * from "./payments";
export * from "./notifications";
export * from "./notifications/tokens";
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
export * from "./providers/decideProviderApplication";
export * from "./providers/applyAsProvider";
export * from "./providers/onboardingSettingsCallables";
export * from "./providers/backfillSelfRegisteredProviders";
export * from "./availability";
export * from "./users/migrateAudit";
export { onUserWriteAdminIndex } from "./users/onUserWriteAdminIndex";
export * from "./categories/seedCategories";
export * from "./categories/backfillCategories";
export * from "./categories/mergeCategories";
export * from "./config/pilotFlags";
export * from "./geo/syncGeohash";
export * from "./chat/onMessageCreated";

// Staging-only: Auth blocking functions (the login allowlist) and the superadmin callables
// that manage it. Loaded conditionally because production (vfit-funlife) has no Identity
// Platform — a blocking function in its build would fail the deploy — and nothing of this
// feature should exist there. `firebase deploy` sets GCLOUD_PROJECT to the target project
// during discovery; see staging/allowlist.ts for the emulator rule.
import { stagingAllowlistEnabled } from "./staging/allowlist";
if (stagingAllowlistEnabled()) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const staging = require("./staging/functions") as typeof import("./staging/functions");
  Object.assign(exports, {
    stagingBeforeUserCreated: staging.stagingBeforeUserCreated,
    stagingBeforeUserSignedIn: staging.stagingBeforeUserSignedIn,
    addStagingAccess: staging.addStagingAccess,
    removeStagingAccess: staging.removeStagingAccess,
  });
}
