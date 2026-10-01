"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/hooks/useI18n";
import { usePaymentSettings, type PaymentSettings } from "@/hooks/usePaymentSettings";
import { Button } from "@/components/ui/button";
import { setPaymentSettings } from "@/lib/firebase/functions";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/queryKeys";
import type { MessageKey } from "@/i18n/messages";

/**
 * Whether the platform takes money through Stripe, and whether it sells VIP subscriptions.
 *
 * Both default to off: the first release charges nothing (bookings are paid to the trainer
 * directly). The Stripe callables refuse while a switch is off, and the app hides the VIP and
 * wallet entry points, so turning one on is the whole launch — no release needed.
 *
 * Superadmin only, and audited server-side by setPaymentSettings.
 */
export function PaymentSettingsPanel() {
  const { t } = useI18n();
  const { settings, isLoading } = usePaymentSettings();

  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
        <p className="text-sm text-content-muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <PaymentSettingsForm
      key={`${settings.stripePaymentsEnabled}-${settings.subscriptionsEnabled}`}
      initial={settings}
    />
  );
}

function PaymentSettingsForm({ initial }: { initial: PaymentSettings }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);

  const save = useMutation({
    mutationFn: setPaymentSettings,
    onSuccess: ({ stripePaymentsEnabled, subscriptionsEnabled }) => {
      queryClient.setQueryData(queryKeys.paymentSettings(), {
        stripePaymentsEnabled,
        subscriptionsEnabled,
      });
      notify.success(t("admin.settings.savedSuccess"));
    },
  });

  const dirty =
    draft.stripePaymentsEnabled !== initial.stripePaymentsEnabled ||
    draft.subscriptionsEnabled !== initial.subscriptionsEnabled;

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-[#10B981] light:text-emerald-700" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">
            {t("admin.settings.paymentSwitches.title")}
          </h3>
          <p className="text-sm text-content-muted">
            {t("admin.settings.paymentSwitches.subtitle")}
          </p>
        </div>
      </div>

      <SwitchRow
        labelKey="admin.settings.paymentSwitches.stripe.label"
        hintKey={
          draft.stripePaymentsEnabled
            ? "admin.settings.paymentSwitches.stripe.onHint"
            : "admin.settings.paymentSwitches.stripe.offHint"
        }
        checked={draft.stripePaymentsEnabled}
        // Subscriptions can't outlive Stripe: switching Stripe off clears the stored flag too, so
        // re-enabling Stripe later never silently re-arms VIP sales.
        onChange={(v) =>
          setDraft((d) => ({
            ...d,
            stripePaymentsEnabled: v,
            subscriptionsEnabled: v ? d.subscriptionsEnabled : false,
          }))
        }
      />

      <SwitchRow
        labelKey="admin.settings.paymentSwitches.subscriptions.label"
        hintKey={
          !draft.stripePaymentsEnabled
            ? "admin.settings.paymentSwitches.subscriptions.needsStripe"
            : draft.subscriptionsEnabled
              ? "admin.settings.paymentSwitches.subscriptions.onHint"
              : "admin.settings.paymentSwitches.subscriptions.offHint"
        }
        checked={draft.subscriptionsEnabled && draft.stripePaymentsEnabled}
        disabled={!draft.stripePaymentsEnabled}
        onChange={(v) => setDraft((d) => ({ ...d, subscriptionsEnabled: v }))}
      />

      {save.isError && (
        <p className="text-sm text-[#EF4444] light:text-red-700 mt-4">
          {t("admin.settings.paymentSwitches.saveError")}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <Button
          variant="primary"
          disabled={!dirty || save.isPending}
          isLoading={save.isPending}
          onClick={() => save.mutate(draft)}
        >
          {t("common.save")}
        </Button>
        {dirty && (
          <span className="text-xs text-warning-DEFAULT">
            {t("admin.settings.paymentSwitches.unsaved")}
          </span>
        )}
      </div>
    </div>
  );
}

function SwitchRow({
  labelKey,
  hintKey,
  checked,
  disabled = false,
  onChange,
}: {
  labelKey: MessageKey;
  hintKey: MessageKey;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-surface-elevated rounded-xl mt-4">
      <div>
        <p className="font-medium text-content">{t(labelKey)}</p>
        <p className="text-xs text-content-muted mt-0.5">{t(hintKey)}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={t(labelKey)}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          checked ? "bg-[#10B981]" : "bg-content/20"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
