import { create } from "zustand";
import { streamAssistant } from "@/lib/firebase/functions";
import type { ChatMessage, ResultCard } from "@/types/assistant";

interface AssistantState {
  isOpen: boolean;
  currentChatId?: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error?: string;
  open: () => void;
  close: () => void;
  newChat: () => void;
  send: (message: string, locale: string) => Promise<void>;
}

let idSeq = 0;
const localId = () => `local-${++idSeq}`;

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  newChat: () => set({ currentChatId: undefined, messages: [], error: undefined }),

  send: async (message, locale) => {
    if (get().isStreaming || !message.trim()) return;
    const userMsg: ChatMessage = { id: localId(), role: "user", content: message };
    const asstId = localId();
    set((s) => ({
      messages: [
        ...s.messages,
        userMsg,
        { id: asstId, role: "assistant", content: "", pending: true },
      ],
      isStreaming: true,
      error: undefined,
    }));

    const patchAsst = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === asstId ? fn(m) : m)) }));

    try {
      const { stream, data } = await streamAssistant({
        chatId: get().currentChatId,
        message,
        locale,
      });
      const cards: ResultCard[] = [];
      for await (const chunk of stream) {
        if (chunk.type === "delta") {
          patchAsst((m) => ({ ...m, content: m.content + chunk.text, pending: false }));
        } else if (chunk.type === "cards") {
          cards.push(...chunk.cards);
          patchAsst((m) => ({ ...m, resultCards: [...cards] }));
        } else if (chunk.type === "error") {
          set({ error: chunk.code });
          patchAsst((m) => ({ ...m, pending: false }));
        } else if (chunk.type === "done") {
          set({ currentChatId: chunk.chatId });
        }
      }
      const final = await data;
      patchAsst((m) => ({
        ...m,
        content: final.text || m.content,
        resultCards: final.cards ?? m.resultCards,
        pending: false,
      }));
      set({ currentChatId: final.chatId });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (!get().error) {
        set({ error: err?.code || err?.message || "error" });
      }
      patchAsst((m) => ({ ...m, pending: false }));
    } finally {
      set({ isStreaming: false });
    }
  },
}));
