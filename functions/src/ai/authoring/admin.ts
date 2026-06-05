import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { requireSuperAdmin } from "../../utils/roles";
import { writeAuditLog } from "../../lib/audit";
import { getAiAuthoringSettings, AI_AUTHORING_DOC } from "./settings";
import { keyPresence, AI_SECRETS } from "../providers";

const region = process.env.FIREBASE_REGION || "europe-west1";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["anthropic", "openai", "google", "openai-compatible"]).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(256).max(8192).optional(),
  dailyQuota: z.number().int().min(0).max(500).optional(),
  systemPromptOverride: z.string().max(4000).optional(),
});

/** Validate & coerce a partial AI authoring settings patch. Throws on invalid input. */
export function validateAuthoringPatch(patch: unknown) {
  return patchSchema.parse(patch);
}

/** Superadmin: read authoring settings + which providers have keys. */
export const getAiAuthoringSettingsAdmin = onCall(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    try {
      await requireSuperAdmin(request.auth.uid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin only");
    }
    const settings = await getAiAuthoringSettings();
    return { settings, keyPresence: keyPresence() };
  },
);

/** Superadmin: update authoring settings + audit. */
export const updateAiAuthoringSettings = onCall(
  { region },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const callerId = request.auth.uid;
    try {
      await requireSuperAdmin(callerId);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin only");
    }

    let patch;
    try {
      patch = validateAuthoringPatch(request.data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : undefined;
      throw new HttpsError("invalid-argument", message ?? "Invalid settings");
    }

    const before = await getAiAuthoringSettings();
    const callerEmail =
      (await admin.firestore().collection("users").doc(callerId).get()).data()?.email ??
      request.auth?.token?.email ??
      "";

    await admin.firestore().doc(AI_AUTHORING_DOC).set(
      { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: callerId },
      { merge: true },
    );

    await writeAuditLog({
      actorUid: callerId,
      actorEmail: callerEmail,
      actorRole: "superadmin",
      action: "update",
      entityType: "ai_settings",
      entityId: "aiAuthoring",
      before: before as unknown as Record<string, unknown>,
      after: patch as Record<string, unknown>,
    });

    return { success: true };
  },
);
