"use client";

import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import {
  getProviderOnboardingSettings,
  setProviderOnboardingSettings,
} from "@/lib/firebase/functions";

/**
 * Whether signing up as a professional lists you straight away, or waits for an admin.
 *
 * Saved on click rather than staged: it is a single switch, and there is nothing to batch it
 * with. The value is read server-side by `applyAsProvider` on every application, so the
 * change applies to the next signup with no deploy.
 *
 * Admin-level, like provider verification itself — an admin can already verify or un-verify
 * any individual provider, so withholding the switch that decides whether they have to would
 * buy nothing but clicks.
 */
export function ProviderOnboardingSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["provider-onboarding-settings"],
    queryFn: getProviderOnboardingSettings,
  });

  const save = useMutation({
    mutationFn: setProviderOnboardingSettings,
    onSuccess: (result) => {
      queryClient.setQueryData(["provider-onboarding-settings"], {
        autoApprove: result.autoApprove,
      });
    },
  });

  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof data?.autoApprove === "boolean") setAutoApprove(data.autoApprove);
  }, [data?.autoApprove]);

  if (isLoading || autoApprove === null) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
        <p className="text-sm text-content-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
        <p className="text-sm text-[#EF4444]">{t("admin.settings.providerOnboarding.loadError")}</p>
      </div>
    );
  }

  const dirty = autoApprove !== data?.autoApprove;

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
          <UserCheck className="w-5 h-5 text-[#10B981]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">
            {t("admin.settings.providerOnboarding.title")}
          </h3>
          <p className="text-sm text-content-muted">
            {t("admin.settings.providerOnboarding.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 bg-surface-elevated rounded-xl mt-4">
        <div>
          <p className="font-medium text-content">
            {t("admin.settings.providerOnboarding.autoApprove.label")}
          </p>
          <p className="text-xs text-content-muted mt-0.5">
            {autoApprove
              ? t("admin.settings.providerOnboarding.autoApprove.onHint")
              : t("admin.settings.providerOnboarding.autoApprove.offHint")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("admin.settings.providerOnboarding.autoApprove.label")}
          aria-pressed={autoApprove}
          onClick={() => setAutoApprove(!autoApprove)}
          className={`relative w-12 h-6 shrink-0 rounded-full transition-colors ${
            autoApprove ? "bg-[#10B981]" : "bg-white/20"
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              autoApprove ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {save.isError && (
        <p className="text-sm text-[#EF4444] mt-4">
          {t("admin.settings.providerOnboarding.saveError")}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <Button
          variant="primary"
          disabled={!dirty || save.isPending}
          isLoading={save.isPending}
          onClick={() => save.mutate({ autoApprove })}
        >
          {t("common.save")}
        </Button>
        {dirty && (
          <span className="text-xs text-warning-DEFAULT">
            {t("admin.settings.providerOnboarding.unsaved")}
          </span>
        )}
      </div>
    </div>
  );
}
