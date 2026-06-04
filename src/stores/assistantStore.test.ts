import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AiStreamChunk } from "@/types/assistant";

const chunks: AiStreamChunk[] = [
  { type: "delta", text: "Hello " },
  { type: "delta", text: "there" },
  {
    type: "cards",
    cards: [{ kind: "provider", id: "p1", title: "Mario", bookingHref: "/book?providerId=p1" }],
  },
  { type: "done", chatId: "c1", messageId: "m1" },
];

vi.mock("@/lib/firebase/functions", () => ({
  streamAssistant: vi.fn(async () => ({
    stream: (async function* () {
      for (const c of chunks) yield c;
    })(),
    data: Promise.resolve({
      chatId: "c1",
      messageId: "m1",
      text: "Hello there",
      cards: [{ kind: "provider", id: "p1", title: "Mario", bookingHref: "/book?providerId=p1" }],
    }),
  })),
}));

import { useAssistantStore } from "./assistantStore";

describe("assistantStore.send", () => {
  beforeEach(() =>
    useAssistantStore.setState({
      messages: [],
      currentChatId: undefined,
      isStreaming: false,
      error: undefined,
    }),
  );

  it("appends user msg, streams assistant deltas, applies cards, sets chatId", async () => {
    await useAssistantStore.getState().send("hi", "en");
    const s = useAssistantStore.getState();
    expect(s.messages[0]).toMatchObject({ role: "user", content: "hi" });
    expect(s.messages[1]).toMatchObject({ role: "assistant", content: "Hello there" });
    expect(s.messages[1].resultCards?.[0].id).toBe("p1");
    expect(s.currentChatId).toBe("c1");
    expect(s.isStreaming).toBe(false);
  });

  it("ignores empty messages and does not stream", async () => {
    await useAssistantStore.getState().send("   ", "en");
    const s = useAssistantStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.isStreaming).toBe(false);
  });

  it("open/close/newChat manage open + reset state", () => {
    useAssistantStore.getState().open();
    expect(useAssistantStore.getState().isOpen).toBe(true);
    useAssistantStore.getState().close();
    expect(useAssistantStore.getState().isOpen).toBe(false);

    useAssistantStore.setState({
      messages: [{ id: "x", role: "user", content: "hi" }],
      currentChatId: "c1",
      error: "boom",
    });
    useAssistantStore.getState().newChat();
    const s = useAssistantStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.currentChatId).toBeUndefined();
    expect(s.error).toBeUndefined();
  });
});
