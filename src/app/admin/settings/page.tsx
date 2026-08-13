"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { PlatformSettings } from "@/types/admin";
import { SeedDataPanel } from "@/components/admin";
import { SuperadminOnly } from "@/components/admin/SuperadminOnly";
import { AiAssistantSettings } from "@/components/admin/settings/AiAssistantSettings";
import { AiAuthoringSettings } from "@/components/admin/settings/AiAuthoringSettings";
import { PilotFlagsSettings } from "@/components/admin/settings/PilotFlagsSettings";
import { useI18n } from "@/hooks/useI18n";
import {
  Save,
  Shield,
  Mail,
  CreditCard,
  Bell,
  AlertTriangle,
  Database,
} from "lucide-react";

export default function SettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuthStore();
  const { platformSettings, fetchPlatformSettings, updatePlatformSettingsAction } = useAdminStore();

  const [settings, setSettings] = useState<PlatformSettings>({
    platformName: "VFit",
    commissionPercentage: 15,
    cancellationPolicy: "24 hours",
    currency: "EUR",
    supportEmail: "support@vfit.com",
    supportPhone: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.role !== "superadmin") {
      router.push("/admin");
      return;
    }
    fetchPlatformSettings();
  }, [user, router, fetchPlatformSettings]);

  useEffect(() => {
    if (platformSettings) {
      setSettings(platformSettings);
    }
  }, [platformSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePlatformSettingsAction(settings);
      alert(t('admin.settings.savedSuccess'));
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.settings.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.settings.subtitle')}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {t('admin.settings.saveChanges')}
        </Button>
      </div>

      {/* Superadmin Warning */}
      <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-[#FFD700] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#FFD700]">{t('admin.settings.superadminOnly.label')}</p>
          <p className="text-sm text-content-muted">
            {t('admin.settings.superadminOnly.description')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content">{t('admin.settings.general.title')}</h3>
              <p className="text-sm text-content-muted">{t('admin.settings.general.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.general.platformName')}
              </label>
              <input
                type="text"
                value={settings.platformName}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, platformName: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.general.supportEmail')}
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.general.supportPhone')}
              </label>
              <input
                type="tel"
                value={settings.supportPhone}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, supportPhone: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.general.currency')}
              </label>
              <select
                value={settings.currency}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, currency: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payment Settings */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content">{t('admin.settings.payment.title')}</h3>
              <p className="text-sm text-content-muted">{t('admin.settings.payment.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.payment.commissionLabel')}
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.commissionPercentage}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    commissionPercentage: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              />
              <p className="text-xs text-content-faint mt-1">
                {t('admin.settings.payment.commissionHint')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-muted mb-2">
                {t('admin.settings.payment.cancellationPolicy')}
              </label>
              <select
                value={settings.cancellationPolicy}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cancellationPolicy: e.target.value,
                  }))
                }
                className="w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
              >
                <option value="12 hours">{t('admin.settings.payment.policy12h')}</option>
                <option value="24 hours">{t('admin.settings.payment.policy24h')}</option>
                <option value="48 hours">{t('admin.settings.payment.policy48h')}</option>
                <option value="72 hours">{t('admin.settings.payment.policy72h')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pilot flags (Remote Config) */}
        <SuperadminOnly>
          <PilotFlagsSettings />
        </SuperadminOnly>

        {/* Maintenance Mode */}
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-content">{t('admin.settings.maintenance.title')}</h3>
              <p className="text-sm text-content-muted mt-1">
                {t('admin.settings.maintenance.description')}
              </p>
              <div className="flex items-center justify-between mt-4 p-4 bg-surface-sunken rounded-xl">
                <span className="text-content font-medium">{t('admin.settings.maintenance.enableLabel')}</span>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      maintenanceMode: !prev.maintenanceMode,
                    }))
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.maintenanceMode ? "bg-[#EF4444]" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.maintenanceMode ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Data Management */}
        <div className="bg-surface rounded-2xl border border-hairline p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content">{t('admin.settings.demoData.title')}</h3>
              <p className="text-sm text-content-muted">{t('admin.settings.demoData.subtitle')}</p>
            </div>
          </div>
          
          <SeedDataPanel />
        </div>

        {/* AI Assistant */}
        <SuperadminOnly>
          <AiAssistantSettings />
        </SuperadminOnly>

        {/* AI Authoring */}
        <SuperadminOnly>
          <AiAuthoringSettings />
        </SuperadminOnly>
      </div>
    </div>
  );
}
