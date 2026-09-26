import { onCall, HttpsError, CallableRequest, CallableResponse } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { getAiSettings } from "./settings";
import { buildModel, AI_SECRETS } from "./providers";
import { createAiTools } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { reserveQuota, recordTokens, releaseQuota } from "./quota";
import { ResultCard, AiStreamChunk } from "./types";
import { hotCallableOptions } from "../lib/runtimeOptions";

interface ChatRequest {
  chatId?: string;
  message: string;
  locale?: string;
}

export const chatWithAssistant = onCall<ChatRequest>(
  hotCallableOptions<ChatRequest>({ secrets: AI_SECRETS }),
  async (request: CallableRequest<ChatRequest>, response?: CallableResponse<AiStreamChunk>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();

    // Stream a chunk to the client only when streaming was requested.
    // sendChunk itself noops on non-streaming requests, but guard defensively.
    const send = (chunk: AiStreamChunk) => {
      if (request.acceptsStreaming && response) void response.sendChunk(chunk);
    };

    // Settings + kill-switch
    const settings = await getAiSettings();
    if (!settings.enabled) {
      send({ type: "error", code: "disabled" });
      throw new HttpsError("failed-precondition", "disabled");
    }

    // Input validation
    const message = (request.data.message ?? "").trim();
    if (!message) throw new HttpsError("invalid-argument", "Empty message");
    if (message.length > settings.maxInputChars) {
      send({ type: "error", code: "input-too-long" });
      throw new HttpsError("invalid-argument", "input-too-long");
    }
    const locale = request.data.locale ?? "en";

    // Quota (transactional reserve)
    try {
      await reserveQuota(uid, settings.dailyMessageQuota, now);
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "quota-exceeded") {
        send({ type: "error", code: "quota-exceeded" });
        throw new HttpsError("resource-exhausted", "quota-exceeded");
      }
      throw e;
    }

    // Resolve / create chat. Track creation so we set title/createdAt only once.
    const userRef = db.collection("users").doc(uid);
    const isNewChat = !request.data.chatId;
    const chatRef = isNewChat ?
      userRef.collection("chats").doc() :
      userRef.collection("chats").doc(request.data.chatId as string);
    const chatId = chatRef.id;

    // Load capped history (oldest first)
    const histSnap = await chatRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(settings.maxContextMessages)
      .get()
      .catch((e) => {
        console.warn("[ai] history fetch failed", e);
        return null;
      });
    // Prior tool-call/tool-result pairs are intentionally collapsed to plain text
    // content for context; multi-turn tool continuity is not preserved by design.
    const history: ModelMessage[] = (histSnap?.docs ?? []).map((d) => {
      const m = d.data() as Record<string, unknown>;
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      };
    });

    // City hint from the requesting customer's users/{uid} doc.
    // Customers have no providerProfile/serviceArea, so read the flat `city`.
    const userData = (await userRef.get()).data() as Record<string, unknown> | undefined;
    const city: string | undefined = typeof userData?.city === "string" ? userData.city : undefined;

    const system = buildSystemPrompt({
      locale,
      todayISO: now.toISOString().slice(0, 10),
      city,
      override: settings.systemPromptOverride,
    });

    // Persist the user message immediately.
    await chatRef.collection("messages").add({
      role: "user",
      content: message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tools = createAiTools();
    const collectedCards: ResultCard[] = [];

    const result = streamText({
      model: buildModel(settings.provider, settings.model),
      system,
      messages: [...history, { role: "user", content: message }],
      tools,
      stopWhen: stepCountIs(5),
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
    });

    let finalText = "";
    try {
      for await (const part of result.fullStream) {
        // Part shapes confirmed against ai@5.0.196 TextStreamPart:
        //  - text-delta carries `.text`
        //  - tool-call carries `.toolName`
        //  - tool-result carries `.output` (the tool's return value)
        if (part.type === "text-delta") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (part as any).text ?? (part as any).textDelta ?? "";
          finalText += text;
          send({ type: "delta", text });
        } else if (part.type === "tool-call") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          send({ type: "tool", name: (part as any).toolName, status: "running" });
        } else if (part.type === "tool-result") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out = (part as any).output ?? (part as any).result;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          send({ type: "tool", name: (part as any).toolName, status: "done" });
          if (Array.isArray(out)) {
            collectedCards.push(...(out as ResultCard[]));
            send({ type: "cards", cards: out as ResultCard[] });
          }
        } else if (part.type === "tool-error") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolName = (part as any).toolName ?? "unknown";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          console.error("[ai] tool error", toolName, (part as any).error);
          send({ type: "tool", name: toolName, status: "done" });
        } else if (part.type === "error") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          throw (part as any).error ?? new Error("stream error part");
        }
      }
    } catch (err) {
      console.error("[ai] stream error", err);
      send({ type: "error", code: "internal" });
      // Keep history paired by writing a best-effort stub assistant message.
      await chatRef.collection("messages").add({
        role: "assistant", content: "", error: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      // Refund the reserved quota since the request did not complete.
      await releaseQuota(uid, now);
      throw new HttpsError("internal", "AI request failed");
    }

    // usage fields in ai@5 are inputTokens/outputTokens (LanguageModelV2Usage);
    // keep promptTokens/completionTokens fallbacks for older provider shapes.
    // totalUsage aggregates across all agentic steps (vs. usage = final step only).
    type UsageShape = {
      inputTokens?: number;
      outputTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
    };
    const usage = await result.totalUsage.catch(() => undefined) as UsageShape | undefined;
    const inTok = usage?.inputTokens ?? usage?.promptTokens ?? 0;
    const outTok = usage?.outputTokens ?? usage?.completionTokens ?? 0;

    // Persist assistant message + dedupe cards by kind:id.
    const dedupedCards = Array.from(
      new Map(collectedCards.map((c) => [`${c.kind}:${c.id}`, c])).values(),
    );
    const msgRef = await chatRef.collection("messages").add({
      role: "assistant",
      content: finalText,
      resultCards: dedupedCards,
      provider: settings.provider,
      model: settings.model,
      tokensIn: inTok,
      tokensOut: outTok,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Build the chat doc update. Set title + createdAt only when creating a new
    // chat; never overwrite an existing chat's title.
    const chatUpdate: Record<string, unknown> = {
      lastMessagePreview: finalText.slice(0, 120) || (dedupedCards.length ? `${dedupedCards.length} results` : ""),
      locale,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: admin.firestore.FieldValue.increment(2),
    };
    if (isNewChat) {
      chatUpdate.title = message.slice(0, 60);
      chatUpdate.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await chatRef.set(chatUpdate, { merge: true });

    await recordTokens(uid, now, inTok, outTok);

    send({ type: "done", chatId, messageId: msgRef.id });
    return { chatId, messageId: msgRef.id, text: finalText, cards: dedupedCards };
  },
);
