import * as admin from "firebase-admin";
import { AiProviderId } from "../types";

export const AI_AUTHORING_DOC = "systemSettings/aiAuthoring";

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

/** Read authoring settings from Firestore, falling back to defaults. */
export async function getAiAuthoringSettings(): Promise<AiAuthoringSettings> {
  try {
    const snap = await admin.firestore().doc(AI_AUTHORING_DOC).get();
    return mergeAiAuthoringSettings(snap.exists ? (snap.data() as Partial<AiAuthoringSettings>) : undefined);
  } catch (err) {
    throw new Error(`Failed to load AI authoring settings from Firestore: ${err}`);
  }
}
