import { AiProviderId } from "../types";
import { cachedDocRead, invalidateCachedDoc } from "../../lib/cachedDoc";

export const AI_AUTHORING_DOC = "systemSettings/aiAuthoring";

/**
 * TTL: 60s (the `cachedDocRead` default). Read on every recipe/workout/training-program
 * generation call (generateRecipes, generateWorkoutPlan, generateTrainingProgram), so caching
 * removes a Firestore read per generation request. Staleness: up to 60s after an admin changes
 * quotas or flips `enabled` — see cachedDoc.ts for why that window can't be closed for
 * instances other than the one that wrote the change. Acceptable here for the same reason as
 * ai/settings.ts: no hard security boundary, and `invalidateAiAuthoringSettingsCache` keeps the
 * admin panel's own instance from reading back its own stale write.
 */
const CACHE_TTL_MS = 60_000;

export interface AiAuthoringSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  dailyQuota: number;
  recipeClientDailyQuota: number;
  systemPromptOverride?: string;
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;
}

export const DEFAULT_AI_AUTHORING_SETTINGS: AiAuthoringSettings = {
  enabled: false,
  provider: "google",
  model: "gemini-2.5-flash",
  temperature: 0.4,
  maxOutputTokens: 4096,
  dailyQuota: 20,
  recipeClientDailyQuota: 3,
};

/** Merge a partial stored settings doc over the defaults. */
export function mergeAiAuthoringSettings(
  stored: Partial<AiAuthoringSettings> | undefined,
): AiAuthoringSettings {
  return {
    ...DEFAULT_AI_AUTHORING_SETTINGS,
    ...(stored ?? {}),
  };
}

/** Read authoring settings from Firestore (cached, see CACHE_TTL_MS above), falling back to defaults. */
export async function getAiAuthoringSettings(): Promise<AiAuthoringSettings> {
  try {
    const stored = await cachedDocRead<Partial<AiAuthoringSettings>>(AI_AUTHORING_DOC, CACHE_TTL_MS);
    return mergeAiAuthoringSettings(stored);
  } catch (err) {
    throw new Error(`Failed to load AI authoring settings from Firestore: ${err}`);
  }
}

/** Call right after writing AI_AUTHORING_DOC so this instance never reads back its own stale write. */
export function invalidateAiAuthoringSettingsCache(): void {
  invalidateCachedDoc(AI_AUTHORING_DOC);
}
