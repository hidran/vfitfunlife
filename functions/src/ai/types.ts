export type AiProviderId = "anthropic" | "openai" | "google" | "openai-compatible";

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
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;
}

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
  bookingHref: string; // e.g. "/book?providerId=abc"
}

// Streaming chunk protocol (function -> client)
export type AiStreamChunk =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "cards"; cards: ResultCard[] }
  | { type: "error"; code: string }
  | { type: "done"; chatId: string; messageId: string };
