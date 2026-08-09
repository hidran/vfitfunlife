/**
 * `generateWorkoutPlan` — the P2-5 replacement for `generateTrainingProgram`.
 *
 * Differences that matter:
 *  - exercises are catalog IDs, reconciled server-side, never invented names
 *  - injuries filter the candidate set before the model sees it
 *  - the plan is saved as `draft` and must be published by a human
 *  - the prompt is stored for audit (`aiPromptSnapshot`)
 *
 * Spec: docs/superpowers/specs/2026-08-09-workout-plans-design.md
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { generateObject } from "ai";
import { buildModel, AI_SECRETS } from "../providers";
import { getAiAuthoringSettings } from "./settings";
import { reserveQuota, recordTokens, releaseQuota } from "../quota";
import { writeAuditLog } from "../../lib/audit";
import { getUserRoleInfo } from "../../utils/roles";
import {
  buildWorkoutPlanPrompt,
  candidateExercises,
  reconcileWithCatalog,
  workoutPlanParamsSchema,
  workoutPlanSchema,
  MEDICAL_CLEARANCE_NOTE,
} from "./workoutPlan";

const region = process.env.FIREBASE_REGION || "europe-west1";
const BUCKET = "ai_authoring_usage";

interface GenReq {
  clientId: string;
  locale?: string;
  params: unknown;
}

export const generateWorkoutPlan = onCall<GenReq>(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<GenReq>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();

    const clientId = request.data?.clientId;
    if (!clientId) throw new HttpsError("invalid-argument", "Missing clientId");

    const role = await getUserRoleInfo(uid);
    if (!role) throw new HttpsError("permission-denied", "Unknown user");
    if (role.isActive === false) throw new HttpsError("permission-denied", "Account is deactivated");

    const clientSnap = await db.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) throw new HttpsError("not-found", "Client not found");
    const client = clientSnap.data() as { providerId?: string; userId?: string };

    const isStaff = role.role === "admin" || role.role === "superadmin";
    const isOwner = role.role === "provider" && client.providerId === uid;
    if (!isStaff && !isOwner) {
      throw new HttpsError("permission-denied", "Not authorized for this client");
    }

    const parsed = workoutPlanParamsSchema.safeParse(request.data?.params);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid params");
    }
    const params = parsed.data;

    const settings = await getAiAuthoringSettings();
    if (!settings.enabled) throw new HttpsError("failed-precondition", "disabled");

    try {
      await reserveQuota(uid, settings.dailyQuota, now, BUCKET);
    } catch (e) {
      if ((e as { code?: string })?.code === "quota-exceeded") {
        throw new HttpsError("resource-exhausted", "quota-exceeded");
      }
      throw e;
    }

    // Injury and equipment filtering happens BEFORE the model sees anything. Asking the
    // prompt nicely is not a guardrail; removing the movement from the candidate set is.
    const candidates = candidateExercises(params);
    if (candidates.length < 4) {
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError(
        "failed-precondition",
        "not-enough-exercises: le limitazioni e l'attrezzatura selezionate lasciano troppi pochi esercizi",
      );
    }

    const goalsSnap = await db.collection("clients").doc(clientId).collection("goals")
      .where("status", "==", "active").get().catch(() => null);
    const goals = (goalsSnap?.docs ?? []).map((d) => d.data() as { description?: string });

    const prompt = buildWorkoutPlanPrompt({
      params, candidates, goals, locale: request.data?.locale ?? "it",
    });

    let raw;
    try {
      const res = await generateObject({
        model: buildModel(settings.provider, settings.model),
        schema: workoutPlanSchema,
        prompt,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
      });
      raw = res.object;
      const usage = (res as { usage?: Record<string, number> }).usage;
      await recordTokens(
        uid, now,
        usage?.inputTokens ?? usage?.promptTokens ?? 0,
        usage?.outputTokens ?? usage?.completionTokens ?? 0,
        BUCKET,
      );
    } catch (err) {
      logger.error("[workout-plan] generation failed", err);
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "Generation failed");
    }

    const { plan, unknown, remapped, dropped } = reconcileWithCatalog(raw, candidates);

    if (!plan.weeks.length) {
      // Everything the model produced was unusable. Better to fail loudly than to save an
      // empty scheda the trainer has to discover is empty.
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "generation-unusable");
    }

    if (unknown.length) {
      logger.warn("[workout-plan] model proposed unknown exercises", {
        unknown: unknown.slice(0, 20), remapped, dropped,
      });
    }

    const hasInjuries = (params.injuryAreas?.length ?? 0) > 0 || Boolean(params.injuryNotes);

    const ref = await db.collection("clients").doc(clientId)
      .collection("trainingPrograms").add({
        ...plan,
        durationWeeks: params.durationWeeks,
        daysPerWeek: params.daysPerWeek,
        // ALWAYS draft. The trainer reviews and publishes; nothing auto-publishes.
        status: "draft",
        source: "ai",
        generatedByAi: true,
        model: settings.model,
        // Kept for audit: if a plan is ever questioned, the exact prompt is recoverable.
        aiPromptSnapshot: prompt.slice(0, 20000),
        aiReconciliation: { remapped, dropped, unknown: unknown.slice(0, 20) },
        medicalClearanceNote: hasInjuries ? MEDICAL_CLEARANCE_NOTE : null,
        anamnesis: params,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await writeAuditLog({
      actorUid: uid,
      actorEmail: request.auth.token?.email ?? "",
      actorRole: isStaff ? "admin" : "admin",
      action: "create",
      entityType: "ai_plan",
      entityId: ref.id,
      after: { clientId, kind: "workoutPlan", status: "draft", remapped, dropped },
    });

    return {
      id: ref.id,
      status: "draft" as const,
      remapped,
      dropped,
      medicalClearanceNote: hasInjuries ? MEDICAL_CLEARANCE_NOTE : null,
      ...plan,
    };
  }
);
