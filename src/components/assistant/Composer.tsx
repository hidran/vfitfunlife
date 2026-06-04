"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";

export function Composer({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue("");
  };
  return (
    <div className="flex items-end gap-2 border-t border-hairline p-3 bg-surface">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={2000}
        placeholder={t("assistant.placeholder")}
        className="flex-1 resize-none bg-surface-elevated border border-hairline rounded-xl px-3 py-2 text-content text-sm focus:outline-none focus:border-[#00C9FF]/50"
      />
      <button
        onClick={submit}
        disabled={disabled}
        aria-label={t("assistant.send")}
        className="shrink-0 w-10 h-10 rounded-xl bg-[#00C9FF] text-black flex items-center justify-center disabled:opacity-40"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
