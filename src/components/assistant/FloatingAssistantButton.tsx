"use client";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { useI18n } from "@/hooks/useI18n";
import { AssistantSheet } from "./AssistantSheet";

export function FloatingAssistantButton() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const open = useAssistantStore((s) => s.open);
  const isOpen = useAssistantStore((s) => s.isOpen);

  // Any logged-in user (customers, providers, and staff/superadmin).
  if (!isInitialized || !user) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={open}
          aria-label={t("assistant.title")}
          className="fixed z-50 bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 w-14 h-14 rounded-full bg-[#00C9FF] text-black shadow-lg flex items-center justify-center"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}
      <AssistantSheet />
    </>
  );
}
