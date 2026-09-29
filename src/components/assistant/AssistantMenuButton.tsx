"use client";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { useAssistantStore } from "@/stores/assistantStore";

/** Menu entry that opens the assistant sheet (mounted once, in app/providers.tsx). */
export function AssistantMenuButton({
  className,
  onOpen,
  hideLabel = false,
}: {
  className?: string;
  /** Run before opening, e.g. to close the menu the entry lives in. */
  onOpen?: () => void;
  hideLabel?: boolean;
}) {
  const { t } = useI18n();
  const open = useAssistantStore((s) => s.open);
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        open();
      }}
      aria-label={hideLabel ? t("assistant.title") : undefined}
      className={className}
    >
      <Sparkles className="w-5 h-5 text-[#00C9FF] light:text-vfit-secondary" />
      {!hideLabel && t("assistant.title")}
    </button>
  );
}
