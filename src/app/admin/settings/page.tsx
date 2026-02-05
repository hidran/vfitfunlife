"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { PlatformSettings } from "@/types/admin";
import { SeedDataPanel } from "@/components/admin";
import {
  Save,
  Shield,
  Mail,
  CreditCard,
  Bell,
  ToggleLeft,
  AlertTriangle,
  Database,
} from "lucide-react";

export default function SettingsPage() {
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
    featureFlags: {
      enableHomeService: true,
      enableVirtualBookings: true,
      enableVIP: true,
      enableReferrals: true,
      enableChallenges: true,
    },
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
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFeatureToggle = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      featureFlags: {
        ...prev.featureFlags,
        [key]: !prev.featureFlags[key],
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-white/50 mt-1">
            Configure platform-wide settings and preferences
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </div>

      {/* Superadmin Warning */}
      <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-[#FFD700] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#FFD700]">Superadmin Only</p>
          <p className="text-sm text-white/70">
            These settings affect the entire platform. Changes will be applied immediately.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">General Settings</h3>
              <p className="text-sm text-white/50">Basic platform configuration</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Platform Name
              </label>
              <input
                type="text"
                value={settings.platformName}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, platformName: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Support Email
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Support Phone
              </label>
              <input
                type="tel"
                value={settings.supportPhone}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, supportPhone: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Default Currency
              </label>
              <select
                value={settings.currency}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, currency: e.target.value }))
                }
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payment Settings */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Payment Settings</h3>
              <p className="text-sm text-white/50">Commission and payment rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Commission Percentage (%)
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
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              />
              <p className="text-xs text-white/40 mt-1">
                Percentage taken from each booking as platform fee
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Cancellation Policy
              </label>
              <select
                value={settings.cancellationPolicy}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    cancellationPolicy: e.target.value,
                  }))
                }
                className="w-full px-4 py-2.5 bg-[#2A2D3A] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00C9FF]/50"
              >
                <option value="12 hours">12 hours notice</option>
                <option value="24 hours">24 hours notice</option>
                <option value="48 hours">48 hours notice</option>
                <option value="72 hours">72 hours notice</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <ToggleLeft className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Feature Flags</h3>
              <p className="text-sm text-white/50">Enable or disable platform features</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(settings.featureFlags).map(([key, enabled]) => (
              <div
                key={key}
                className="flex items-center justify-between p-4 bg-[#2A2D3A] rounded-xl"
              >
                <div>
                  <p className="font-medium text-white">
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}
                  </p>
                  <p className="text-xs text-white/50">
                    {enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <button
                  onClick={() => handleFeatureToggle(key)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
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
            ))}
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Maintenance Mode</h3>
              <p className="text-sm text-white/70 mt-1">
                When enabled, the platform will be unavailable to users. Only admins will be able to access the system.
              </p>
              <div className="flex items-center justify-between mt-4 p-4 bg-black/20 rounded-xl">
                <span className="text-white font-medium">Enable Maintenance Mode</span>
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
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Demo Data Management</h3>
              <p className="text-sm text-white/50">Seed or clear demo data for testing</p>
            </div>
          </div>
          
          <SeedDataPanel />
        </div>
      </div>
    </div>
  );
}
