"use client";

import { useEffect, useMemo, useState } from "react";
import { ToggleLeft } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { usePilotFlagsAdmin, useSetPilotFlags } from "@/hooks/usePilotFlagsAdmin";
import type { PilotFlagValues } from "@/lib/firebase/pilotFlagsAdmin";
import { Button } from "@/components/ui/button";
import type { MessageKey } from "@/i18n/messages";

const TOGGLES: { key: keyof PilotFlagValues; labelKey: MessageKey; hintKey: MessageKey }[] = [
  {
    key: "pilot_mode",
    labelKey: "admin.settings.pilot.mode.label",
    hintKey: "admin.settings.pilot.mode.hint",
  },
  {
    key: "show_vfun",
    labelKey: "admin.settings.pilot.vfun.label",
    hintKey: "admin.settings.pilot.vfun.hint",
  },
  {
    key: "show_vlife",
    labelKey: "admin.settings.pilot.vlife.label",
    hintKey: "admin.settings.pilot.vlife.hint",
  },
];

/**
 * Superadmin control for the Remote Config pilot flags.
 *
 * Replaces a "Feature Flags" panel that toggled five keys nothing read at runtime — the
 * trap the pilot spec predicted when it left that UI in place next to a real flag system.
 *
 * Edits are staged and published on Save rather than per click: one deliberate change
 * should produce one Remote Config version, or the version history stops being usable for
 * rollback.
 *
 * Spec: docs/superpowers/specs/2026-08-13-pilot-flags-admin-design.md §6
 */
export function PilotFlagsSettings() {
  const { t } = useI18n();
  const { data, isLoading, error } = usePilotFlagsAdmin();
  const publish = useSetPilotFlags();

  const [draft, setDraft] = useState<PilotFlagValues | null>(null);

  useEffect(() => {
    if (data?.flags) setDraft(data.flags);
  }, [data?.flags]);

  const changes = useMemo(() => {
    if (!data?.flags || !draft) return [];
    return (Object.keys(draft) as (keyof PilotFlagValues)[]).filter(
      (k) => draft[k] !== data.flags[k]
    );
  }, [data?.flags, draft]);

  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
        <p className="text-sm text-content-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !draft || !data) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold text-content">{t("admin.settings.pilot.title")}</h3>
        <p className="text-sm text-[#EF4444] mt-2">
          {error instanceof Error ? error.message : t("admin.settings.pilot.loadError")}
        </p>
      </div>
    );
  }

  const save = async () => {
    const diff = changes
      .map((k) => `${t(labelKeyFor(k))}: ${format(data.flags[k])} → ${format(draft[k])}`)
      .join("\n");
    // Enabling a section makes it publicly visible to every visitor, so the diff is
    // spelled out before it ships rather than after.
    if (!confirm(`${t("admin.settings.pilot.confirm")}\n\n${diff}`)) return;

    // Only the changed keys go over the wire, so a stale field elsewhere in the draft
    // can never overwrite a value someone else published.
    const updates = Object.fromEntries(
      changes.map((k) => [k, draft[k]])
    ) as Partial<PilotFlagValues>;
    await publish.mutateAsync(updates);
  };

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
          <ToggleLeft className="w-5 h-5 text-[#7B61FF]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">{t("admin.settings.pilot.title")}</h3>
          <p className="text-sm text-content-muted">{t("admin.settings.pilot.subtitle")}</p>
        </div>
      </div>

      <p className="text-xs text-content-muted mb-6">{t("admin.settings.pilot.propagation")}</p>

      <div className="space-y-4">
        {TOGGLES.map(({ key, labelKey, hintKey }) => {
          const enabled = draft[key] as boolean;
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 p-4 bg-surface-elevated rounded-xl"
            >
              <div>
                <p className="font-medium text-content">{t(labelKey)}</p>
                <p className="text-xs text-content-muted mt-0.5">{t(hintKey)}</p>
              </div>
              <button
                type="button"
                aria-label={t(labelKey)}
                aria-pressed={enabled}
                onClick={() => setDraft({ ...draft, [key]: !enabled })}
                className={`relative w-12 h-6 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-[#10B981]" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    enabled ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          );
        })}

        <div className="p-4 bg-surface-elevated rounded-xl">
          <label htmlFor="pilot-city" className="block font-medium text-content">
            {t("admin.settings.pilot.city.label")}
          </label>
          <p className="text-xs text-content-muted mt-0.5 mb-2">
            {t("admin.settings.pilot.city.hint")}
          </p>
          <input
            id="pilot-city"
            type="text"
            value={draft.pilot_city}
            onChange={(e) => setDraft({ ...draft, pilot_city: e.target.value })}
            className="w-full bg-surface-sunken border border-hairline rounded-lg px-4 py-2.5 text-content outline-none focus:border-section-primary"
          />
        </div>
      </div>

      {publish.isError && (
        <p className="text-sm text-[#EF4444] mt-4">
          {publish.error instanceof Error
            ? publish.error.message
            : t("admin.settings.pilot.saveError")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        <p className="text-xs text-content-muted">
          {data.versionNumber
            ? t("admin.settings.pilot.lastPublished", {
              version: data.versionNumber,
              date: data.updateTime ? new Date(data.updateTime).toLocaleString() : "—",
              email: data.updateUserEmail ?? "—",
            })
            : ""}
        </p>
        <Button
          onClick={save}
          isLoading={publish.isPending}
          disabled={changes.length === 0}
        >
          {t("admin.settings.pilot.save")}
        </Button>
      </div>
    </div>
  );

  function labelKeyFor(k: keyof PilotFlagValues): MessageKey {
    return (
      TOGGLES.find((tg) => tg.key === k)?.labelKey ?? "admin.settings.pilot.city.label"
    );
  }

  function format(v: boolean | string): string {
    if (typeof v === "boolean") {
      return v ? t("admin.settings.pilot.on") : t("admin.settings.pilot.off");
    }
    return v;
  }
}
