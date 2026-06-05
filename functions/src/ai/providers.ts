import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

/** Build an AI SDK LanguageModel for the given provider + model id. */
export function buildModel(provider: AiProviderId, model: string): LanguageModel {
  const apiKey = getProviderApiKey(provider);
  switch (provider) {
  case "anthropic":
    return createAnthropic({ apiKey })(model);
  case "openai":
    return createOpenAI({ apiKey })(model);
  case "google":
    return createGoogleGenerativeAI({ apiKey })(model);
  case "openai-compatible": {
    const baseURL = process.env.OPENAI_COMPAT_BASE_URL;
    if (!baseURL) throw new Error("Missing secret OPENAI_COMPAT_BASE_URL");
    return createOpenAICompatible({ name: "openai-compatible", apiKey, baseURL })(model);
  }
  default:
    throw new Error(`Unknown provider: ${provider}`);
  }
}
