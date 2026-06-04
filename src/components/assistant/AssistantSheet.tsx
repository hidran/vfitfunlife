"use client";
import { useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { useAssistantStore } from "@/stores/assistantStore";
import type { MessageKey } from "@/i18n/messages";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

export function AssistantSheet() {
  const { t, locale } = useI18n();
  const { isOpen, close, messages, isStreaming, activeTool, error, send, newChat } = useAssistantStore();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative z-10 w-full sm:max-w-md h-[80vh] sm:h-[600px] bg-background-dark sm:rounded-2xl rounded-t-2xl border border-hairline flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surface">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#00C9FF]" />
            <span className="font-semibold text-content">{t("assistant.title")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={newChat} className="text-xs text-content-muted">
              {t("assistant.newChat")}
            </button>
            <button onClick={close} aria-label={t("common.close")}>
              <X className="w-5 h-5 text-content-muted" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-content-muted text-sm text-center mt-8">{t("assistant.empty")}</p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {error && (
            <p className="text-red-400 text-xs text-center">
              {t(`assistant.error.${error}` as MessageKey) || t("assistant.error.internal")}
            </p>
          )}
          {isStreaming && activeTool && (
            <p className="text-content-muted text-xs px-1">{t("assistant.searching")}</p>
          )}
          <div ref={endRef} />
        </div>

        <Composer disabled={isStreaming} onSend={(text) => send(text, locale)} />
      </div>
    </div>
  );
}
