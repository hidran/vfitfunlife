"use client";
import Link from "next/link";
import { Star } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { ResultCard } from "@/types/assistant";

export function ResultCardView({ card }: { card: ResultCard }) {
  const { t } = useI18n();
  return (
    <div className="bg-surface-elevated border border-hairline rounded-xl p-3 flex gap-3 items-center">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[#00C9FF]/20" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-content font-medium truncate">{card.title}</p>
        {card.subtitle && <p className="text-content-muted text-xs truncate">{card.subtitle}</p>}
        <div className="flex items-center gap-2 text-xs text-content-muted mt-0.5">
          {typeof card.rating === "number" && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="w-3 h-3" /> {card.rating.toFixed(1)}
            </span>
          )}
          {card.priceLabel && <span>{card.priceLabel}</span>}
          {card.matchingSlots?.[0] && <span className="truncate">{card.matchingSlots[0]}</span>}
        </div>
      </div>
      <Link
        href={card.bookingHref}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#00C9FF] text-black text-sm font-medium"
      >
        {t("assistant.book")}
      </Link>
    </div>
  );
}
