/**
 * `generateRecipes` — P2-6 generic recipe suggestions.
 *
 * READ THIS BEFORE CHANGING THE SIGNATURE: there is no `clientId` parameter, and there must
 * never be one. A recipe generated "for" a named person, from their goals or measurements, is
 * a personalized diet, which an Italian personal trainer may not issue. The absence of that
 * parameter is the primary legal guardrail; the schemas and denylists are secondary.
 *
 * Spec: docs/superpowers/specs/2026-08-09-recipe-suggestions-design.md
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { generateObject } from "ai";
import { buildModel, AI_SECRETS } from "../ai/providers";
import { getAiAuthoringSettings } from "../ai/authoring/settings";
import { reserveQuota, recordTokens, releaseQuota } from "../ai/quota";
import { writeAuditLog } from "../lib/audit";
import { getUserRoleInfo } from "../utils/roles";
import { recipeParamsSchema, recipeBatchSchema } from "./schema";
import { validateIngredients, ForbiddenInputError } from "./screening";
import { quotaForRole, partitionRecipes } from "./policy";
import { buildRecipesPrompt } from "./prompt";

const region = process.env.FIREBASE_REGION || "europe-west1";

/** Separate from `ai_authoring_usage` so recipes cannot eat a trainer's workout-plan budget. */
const BUCKET = "ai_recipes_usage";

interface GenReq {
  locale?: string;
  params: unknown;
}

export const generateRecipes = onCall<GenReq>(
  { region, secrets: AI_SECRETS },
  async (request: CallableRequest<GenReq>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();

    const parsed = recipeParamsSchema.safeParse(request.data?.params);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid params");
    }
    const params = parsed.data;

    // Before quota: a rejected attempt must cost the user nothing.
    let ingredients: string[];
    try {
      ingredients = validateIngredients(params.ingredientsOnHand);
    } catch (e) {
      if (e instanceof ForbiddenInputError) {
        throw new HttpsError("invalid-argument", e.message);
      }
      throw e;
    }

    const role = await getUserRoleInfo(uid);
    if (!role) throw new HttpsError("permission-denied", "Unknown user");
    if (role.isActive === false) throw new HttpsError("permission-denied", "Account is deactivated");

    const settings = await getAiAuthoringSettings();
    if (!settings.enabled) throw new HttpsError("failed-precondition", "disabled");

    const { quota, ownerRole } = quotaForRole(role.role, settings);
    try {
      await reserveQuota(uid, quota, now, BUCKET);
    } catch (e) {
      if ((e as { code?: string })?.code === "quota-exceeded") {
        throw new HttpsError("resource-exhausted", "quota-exceeded");
      }
      throw e;
    }

    // EVERY path that throws below this line must call releaseQuota first. A user who paid a
    // generation must get one, or get the credit back.
    const prompt = buildRecipesPrompt({ params, ingredients, locale: request.data?.locale ?? "it" });

    let batch;
    try {
      const res = await generateObject({
        model: buildModel(settings.provider, settings.model),
        schema: recipeBatchSchema,
        prompt,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
      });
      batch = res.object;
      const usage = (res as { usage?: Record<string, number> }).usage;
      await recordTokens(
        uid, now,
        usage?.inputTokens ?? usage?.promptTokens ?? 0,
        usage?.outputTokens ?? usage?.completionTokens ?? 0,
        BUCKET,
      );
    } catch (err) {
      logger.error("[recipes] generation failed", err);
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "Generation failed");
    }

    const { kept, dropped } = partitionRecipes(batch.recipes);

    if (dropped.length) {
      logger.warn("[recipes] screening dropped recipes", { dropped, kept: kept.length });
    }

    if (!kept.length) {
      // Everything the model produced was unusable. Fail loudly rather than saving nothing
      // and letting the user wonder where their recipes went.
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "generation-unusable");
    }

    // Building the batch is inside the try together with the commit: `batch.set` validates
    // eagerly and throws synchronously on a value Firestore will not accept, which is another
    // way to lose the generation after the quota was already spent.
    const created: { id: string }[] = [];
    try {
      const writeBatch = db.batch();
      for (const recipe of kept) {
        const ref = db.collection("recipes").doc();
        writeBatch.set(ref, {
          ...recipe,
          tags: recipe.tags ?? [],
          params: {
            dietStyle: params.dietStyle,
            excludes: params.excludes ?? [],
            orientation: params.orientation,
            cuisine: params.cuisine,
            maxPrepMinutes: params.maxPrepMinutes,
            budget: params.budget,
          },
          source: "ai",
          model: settings.model,
          aiPromptSnapshot: prompt.slice(0, 20000),
          screening: { droppedCount: dropped.length },
          ownerUid: uid,
          ownerRole,
          sharedWithUserIds: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created.push({ id: ref.id });
      }
      await writeBatch.commit();
    } catch (err) {
      // The user paid quota for a generation they never received.
      logger.error("[recipes] persist failed", err);
      await releaseQuota(uid, now, BUCKET);
      throw new HttpsError("internal", "persist-failed");
    }

    await writeAuditLog({
      actorUid: uid,
      actorEmail: request.auth.token?.email ?? "",
      actorRole: ownerRole === "provider" ? "provider" : ownerRole === "admin" ? "admin" : "client",
      action: "create",
      entityType: "recipe",
      entityId: created[0].id,
      after: { count: created.length, dropped: dropped.length, orientation: params.orientation },
    });

    return {
      recipes: kept.map((recipe, i) => ({ id: created[i].id, ...recipe })),
      dropped: dropped.length,
    };
  }
);
