"use client";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { AssistantSheet } from "./AssistantSheet";

export function FloatingAssistantButton() {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const open = useAssistantStore((s) => s.open);
  const isOpen = useAssistantStore((s) => s.isOpen);

  // Logged-in customers only.
  if (!isInitialized || !user || user.role !== "customer") return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={open}
          aria-label="Open assistant"
          className="fixed z-50 bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 w-14 h-14 rounded-full bg-[#00C9FF] text-black shadow-lg flex items-center justify-center"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}
      <AssistantSheet />
    </>
  );
}
