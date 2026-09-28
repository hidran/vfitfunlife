import { AiAssistantSettings, AiProviderId } from "./types";
import { cachedDocRead, invalidateCachedDoc } from "../lib/cachedDoc";

export const AI_SETTINGS_DOC = "systemSettings/aiAssistant";

/**
 * TTL: 60s (the `cachedDocRead` default). `chatWithAssistant` reads this on every message, so
 * caching removes a Firestore read per chat turn. Staleness: up to 60s after an admin flips
 * `enabled`, changes the model, or adjusts quotas — see cachedDoc.ts for why that window can't
 * be closed for instances other than the one that wrote the change. Acceptable here: none of
 * these settings are a hard security boundary, and `invalidateAiSettingsCache` at least keeps
 * the admin panel's own instance from reading back its own stale write.
 */
const CACHE_TTL_MS = 60_000;

export const DEFAULT_AI_SETTINGS: AiAssistantSettings = {
  enabled: false,
  provider: "google",
  model: "gemini-2.5-flash",
  availableModels: {
    "google": ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    "openai": ["gpt-4o-mini", "gpt-5-mini", "gpt-4o"],
    "anthropic": ["claude-haiku-4-5", "claude-sonnet-4-6"],
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

/** Read settings from Firestore (cached, see CACHE_TTL_MS above), falling back to defaults. */
export async function getAiSettings(): Promise<AiAssistantSettings> {
  try {
    const stored = await cachedDocRead<Partial<AiAssistantSettings>>(AI_SETTINGS_DOC, CACHE_TTL_MS);
    return mergeAiSettings(stored);
  } catch (err) {
    throw new Error(`Failed to load AI assistant settings from Firestore: ${err}`);
  }
}

/** Call right after writing AI_SETTINGS_DOC so this instance never reads back its own stale write. */
export function invalidateAiSettingsCache(): void {
  invalidateCachedDoc(AI_SETTINGS_DOC);
}

export const AI_PROVIDER_IDS = Object.keys(DEFAULT_AI_SETTINGS.availableModels) as AiProviderId[];
