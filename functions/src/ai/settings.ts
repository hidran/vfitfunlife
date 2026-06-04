import * as admin from "firebase-admin";
import { AiAssistantSettings, AiProviderId } from "./types";

export const AI_SETTINGS_DOC = "systemSettings/aiAssistant";

export const DEFAULT_AI_SETTINGS: AiAssistantSettings = {
  enabled: false,
  provider: "google",
  model: "gemini-2.5-flash",
  availableModels: {
    google: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    openai: ["gpt-4o-mini", "gpt-5-mini", "gpt-4o"],
    anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6"],
    "openai-compatible": [],
  },
  temperature: 0.3,
  maxOutputTokens: 1024,
  maxContextMessages: 12,
  maxInputChars: 2000,
  dailyMessageQuota: 30,
};

/** Merge a partial stored settings doc over the defaults. */
export function mergeAiSettings(stored: Partial<AiAssistantSettings> | undefined): AiAssistantSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...(stored ?? {}),
    availableModels: {
      ...DEFAULT_AI_SETTINGS.availableModels,
      ...(stored?.availableModels ?? {}),
    },
  };
}

/** Read settings from Firestore, falling back to defaults. */
export async function getAiSettings(): Promise<AiAssistantSettings> {
  try {
    const snap = await admin.firestore().doc(AI_SETTINGS_DOC).get();
    return mergeAiSettings(snap.exists ? (snap.data() as Partial<AiAssistantSettings>) : undefined);
  } catch (err) {
    throw new Error(`Failed to load AI assistant settings from Firestore: ${err}`);
  }
}

export const AI_PROVIDER_IDS = Object.keys(DEFAULT_AI_SETTINGS.availableModels) as AiProviderId[];
