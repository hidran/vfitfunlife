// Client-side mirror of the server AI assistant types
// (server source of truth: functions/src/ai/types.ts).

export type AiProviderId = "anthropic" | "openai" | "google" | "openai-compatible";

export interface ResultCard {
  kind: "provider" | "instructor" | "class" | "venue";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLabel?: string;
  distanceKm?: number;
  matchingSlots?: string[];
  bookingHref: string;
}

// Streaming chunk protocol (function -> client)
export type AiStreamChunk =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "cards"; cards: ResultCard[] }
  | { type: "error"; code: string }
  | { type: "done"; chatId: string; messageId: string };

export interface AiAssistantSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  availableModels: Record<AiProviderId, string[]>;
  temperature: number;
  maxOutputTokens: number;
  maxContextMessages: number;
  maxInputChars: number;
  dailyMessageQuota: number;
  systemPromptOverride?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  resultCards?: ResultCard[];
  pending?: boolean;
}
