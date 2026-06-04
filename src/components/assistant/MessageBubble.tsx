"use client";
import type { ChatMessage } from "@/types/assistant";
import { ResultCardView } from "./ResultCardView";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "" : "w-full"}`}>
        {(message.content || message.pending) && (
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
              isUser
                ? "bg-[#00C9FF] text-black"
                : "bg-surface border border-hairline text-content"
            }`}
          >
            {message.content || "…"}
          </div>
        )}
        {message.resultCards && message.resultCards.length > 0 && (
          <div className="space-y-2">
            {message.resultCards.map((c) => (
              <ResultCardView key={`${c.kind}:${c.id}`} card={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
