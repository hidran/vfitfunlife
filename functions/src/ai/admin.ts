import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateText } from "ai";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog } from "../lib/audit";
import { getAiSettings, AI_SETTINGS_DOC } from "./settings";
import { buildModel, keyPresence, AI_SECRETS } from "./providers";
import { AiProviderId } from "./types";

const region = process.env.FIREBASE_REGION || "europe-west1";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["anthropic", "openai", "google", "openai-compatible"]).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(64).max(8192).optional(),
  maxContextMessages: z.number().int().min(2).max(50).optional(),
  maxInputChars: z.number().int().min(100).max(8000).optional(),
  dailyMessageQuota: z.number().int().min(0).max(1000).optional(),
  systemPromptOverride: z.string().max(4000).optional(),
});

/** Validate & coerce a partial AI settings patch. Throws on invalid input. */
export function validateSettingsPatch(patch: unknown) {
  return patchSchema.parse(patch);
}

/** Superadmin: read settings + which providers have keys. */
export const getAiSettingsAdmin = onCall(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    try {
      await requireSuperAdmin(request.auth.uid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin only");
    }
    const settings = await getAiSettings();
    return { settings, keyPresence: keyPresence() };
  },
);

/** Superadmin: update settings + audit. */
export const updateAiSettings = onCall(
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
      patch = validateSettingsPatch(request.data);
    } catch (e: any) {
      throw new HttpsError("invalid-argument", e?.message ?? "Invalid settings");
    }

    const before = await getAiSettings();
    const callerEmail =
      (await admin.firestore().collection("users").doc(callerId).get()).data()?.email ?? "";

    await admin.firestore().doc(AI_SETTINGS_DOC).set(
      { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: callerId },
      { merge: true },
    );

    await writeAuditLog({
      actorUid: callerId,
      actorEmail: callerEmail,
      actorRole: "superadmin",
      action: "update",
      entityType: "ai_settings",
      entityId: "aiAssistant",
      before: before as any,
      after: patch as any,
    });

    return { success: true };
  },
);

/** Superadmin: 1-token round-trip to verify provider+model+key work. */
export const testAiConnection = onCall(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<{ provider?: AiProviderId; model?: string }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    try {
      await requireSuperAdmin(request.auth.uid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin only");
    }
    const settings = await getAiSettings();
    const provider = request.data.provider ?? settings.provider;
    const model = request.data.model ?? settings.model;
    try {
      const { text } = await generateText({
        model: buildModel(provider, model),
        prompt: "Reply with the single word: OK",
        maxOutputTokens: 5,
      });
      return { ok: true, sample: text.slice(0, 20) };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
);
