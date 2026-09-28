import type { LanguageModel } from "ai";
import { AiProviderId } from "./types";

const KEY_ENV: Record<AiProviderId, string> = {
  "anthropic": "ANTHROPIC_API_KEY",
  "openai": "OPENAI_API_KEY",
  "google": "GOOGLE_GENAI_API_KEY",
  "openai-compatible": "OPENAI_COMPAT_API_KEY",
};

/** All secret names this feature reads — declared on the function. */
export const AI_SECRETS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_BASE_URL",
];

/** Which providers currently have an API key configured (presence only). */
export function keyPresence(): Record<AiProviderId, boolean> {
  return {
    "anthropic": !!process.env.ANTHROPIC_API_KEY,
    "openai": !!process.env.OPENAI_API_KEY,
    "google": !!process.env.GOOGLE_GENAI_API_KEY,
    "openai-compatible": !!process.env.OPENAI_COMPAT_API_KEY,
  };
}

export function getProviderApiKey(provider: AiProviderId): string {
  const key = process.env[KEY_ENV[provider]];
  if (!key) {
    throw new Error(`Missing secret ${KEY_ENV[provider]} for provider "${provider}"`);
  }
  return key;
}

/**
 * Build an AI SDK LanguageModel for the given provider + model id.
 *
 * Each `@ai-sdk/*` provider package is dynamically imported here, on first
 * actual use, instead of at module scope. These four packages together add
 * ~10-15ms to every cold start when eagerly imported (see P2-1
 * measurements), even for function instances that never touch AI features,
 * because `ai/providers.ts` is transitively pulled in by
 * `functions/src/index.ts`'s `export *` graph. Node caches dynamic imports
 * just like `require`, so the cost is still paid only once per warm
 * instance.
 */
export async function buildModel(provider: AiProviderId, model: string): Promise<LanguageModel> {
  const apiKey = getProviderApiKey(provider);
  switch (provider) {
  case "anthropic": {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    return createAnthropic({ apiKey })(model);
  }
  case "openai": {
    const { createOpenAI } = await import("@ai-sdk/openai");
    return createOpenAI({ apiKey })(model);
  }
  case "google": {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  case "openai-compatible": {
    const baseURL = process.env.OPENAI_COMPAT_BASE_URL;
    if (!baseURL) throw new Error("Missing secret OPENAI_COMPAT_BASE_URL");
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    return createOpenAICompatible({ name: "openai-compatible", apiKey, baseURL })(model);
  }
  default:
    throw new Error(`Unknown provider: ${provider}`);
  }
}
