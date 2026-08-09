/**
 * One-shot seed of the shared exercise library into Firestore.
 *
 * The catalog lives in code (single source of truth, reviewable in git) and is mirrored to
 * Firestore so the client apps can read it without bundling ~90 entries. Idempotent: each
 * document is written by id.
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { getUserRoleInfo } from "../utils/roles";
import { EXERCISE_CATALOG } from "./catalog";

const region = process.env.FIREBASE_REGION || "europe-west1";

export const seedExerciseLibrary = onCall<{ dryRun?: boolean }>(
  { region, timeoutSeconds: 300 },
  async (request: CallableRequest<{ dryRun?: boolean }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const role = await getUserRoleInfo(request.auth.uid);
    if (role?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Superadmin access required");
    }

    const dryRun = request.data?.dryRun === true;
    const db = admin.firestore();
    const batch = db.batch();

    for (const e of EXERCISE_CATALOG) {
      if (dryRun) continue;
      // `secondary` is optional in the catalog, and Firestore rejects undefined values
      // outright — writing the spread as-is throws for every exercise without secondary
      // muscles, which is most of them.
      batch.set(db.collection("exercises").doc(e.id), {
        ...e,
        secondary: e.secondary ?? [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (!dryRun) await batch.commit();

    logger.info("[exercises] seeded", { count: EXERCISE_CATALOG.length, dryRun });
    return { count: EXERCISE_CATALOG.length, dryRun };
  }
);
