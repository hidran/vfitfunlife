import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateObject } from "ai";
import { z } from "zod";
import { buildModel, AI_SECRETS } from "../providers";
import { getAiAuthoringSettings } from "./settings";
import { reserveQuota, recordTokens, releaseQuota } from "../quota";
import { writeAuditLog } from "../../lib/audit";
import { getUserRoleInfo } from "../../utils/roles";
import { trainingProgramSchema, dietPlanSchema, recipeSchema, trainingParamsSchema, dietParamsSchema, recipeParamsSchema } from "./schemas";
import { buildTrainingPrompt, buildDietPrompt, buildRecipePrompt } from "./prompts";

const region = process.env.FIREBASE_REGION || "europe-west1";
const BUCKET = "ai_authoring_usage";

interface GenReq { clientId: string; locale?: string; params: unknown; }

/** Authorize: superadmin/admin OR verified provider who owns the client. Returns the client doc data. */
async function authorizeClient(uid: string, clientId: string) {
  const role = await getUserRoleInfo(uid);
  if (!role) throw new HttpsError("permission-denied", "Unknown user");
  const isStaff = role.role === "admin" || role.role === "superadmin";
  const snap = await admin.firestore().collection("clients").doc(clientId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Client not found");
  const client = snap.data() as { providerId?: string };
  const isOwner = role.role === "provider" && client.providerId === uid;
  if (!isStaff && !isOwner) throw new HttpsError("permission-denied", "Not authorized for this client");
  return { snap, client };
}

async function runGeneration<T extends z.ZodTypeAny>(opts: {
  request: CallableRequest<GenReq>;
  paramsSchema: z.ZodTypeAny;
  outputSchema: T;
  buildPrompt: (ctx: { locale: string; params: any; goals: any[]; recentSessions: string[] }) => string;
  subcollection: "trainingPrograms" | "dietPlans" | "recipes";
}) {
  const { request } = opts;
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const now = new Date();

  const clientId = request.data.clientId;
  if (!clientId) throw new HttpsError("invalid-argument", "Missing clientId");
  await authorizeClient(uid, clientId);

  let params;
  try { params = opts.paramsSchema.parse(request.data.params); }
  catch (e: any) { throw new HttpsError("invalid-argument", e?.message ?? "Invalid params"); }

  const settings = await getAiAuthoringSettings();
  if (!settings.enabled) throw new HttpsError("failed-precondition", "disabled");

  try { await reserveQuota(uid, settings.dailyQuota, now, BUCKET); }
  catch (e: any) { if (e?.code === "quota-exceeded") throw new HttpsError("resource-exhausted", "quota-exceeded"); throw e; }

  // Context: active goals + recent completed sessions
  const clientSnap = await db.collection("clients").doc(clientId).get();
  const userId = (clientSnap.data() as any)?.userId;
  const goalsSnap = await db.collection("clients").doc(clientId).collection("goals").where("status", "==", "active").get().catch(() => null);
  const goals = (goalsSnap?.docs ?? []).map((d) => d.data());
  let recentSessions: string[] = [];
  if (userId) {
    const bk = await db.collection("bookings").where("userId", "==", userId).where("status", "==", "completed").limit(5).get().catch(() => null);
    recentSessions = (bk?.docs ?? []).map((d) => (d.data() as any).serviceName).filter(Boolean);
  }

  const prompt = opts.buildPrompt({ locale: request.data.locale ?? "it", params, goals, recentSessions });

  let object: any;
  try {
    const res = await generateObject({
      model: buildModel(settings.provider, settings.model),
      schema: opts.outputSchema,
      prompt,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
    });
    object = res.object;
    const usage = (res as any).usage;
    await recordTokens(uid, now, usage?.inputTokens ?? usage?.promptTokens ?? 0, usage?.outputTokens ?? usage?.completionTokens ?? 0, BUCKET);
  } catch (err) {
    console.error("[ai-authoring] generateObject failed", err);
    await releaseQuota(uid, now, BUCKET);
    throw new HttpsError("internal", "Generation failed");
  }

  const ref = await db.collection("clients").doc(clientId).collection(opts.subcollection).add({
    ...object,
    source: "ai",
    model: settings.model,
    status: opts.subcollection === "recipes" ? undefined : "active",
    createdBy: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid: uid, actorEmail: request.auth.token?.email ?? "", actorRole: "admin",
    action: "create", entityType: "ai_plan", entityId: ref.id,
    after: { clientId, kind: opts.subcollection },
  });

  return { id: ref.id, ...object, source: "ai", model: settings.model };
}

export const generateTrainingProgram = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: trainingParamsSchema, outputSchema: trainingProgramSchema, buildPrompt: buildTrainingPrompt, subcollection: "trainingPrograms" }));

export const generateDietPlan = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: dietParamsSchema, outputSchema: dietPlanSchema, buildPrompt: buildDietPrompt, subcollection: "dietPlans" }));

export const generateRecipe = onCall<GenReq>({ region, secrets: AI_SECRETS }, (request) =>
  runGeneration({ request, paramsSchema: recipeParamsSchema, outputSchema: recipeSchema, buildPrompt: buildRecipePrompt, subcollection: "recipes" }));
