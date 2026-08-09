"use client";
import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import {
  getAiAuthoringSettingsAdmin,
  updateAiAuthoringSettings,
  testAiConnection,
} from "@/lib/firebase/functions";
import type { AiAuthoringSettings as Settings } from "@/lib/firebase/functions";
import type { AiProviderId } from "@/types/assistant";

const PROVIDERS: AiProviderId[] = ["anthropic", "openai", "google", "openai-compatible"];

export function AiAuthoringSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<Record<AiProviderId, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    getAiAuthoringSettingsAdmin()
      .then((r) => {
        setSettings(r.settings);
        setKeys(r.keyPresence);
      })
      .catch((err) => console.error("[AiAuthoringSettings] failed to load", err));
  }, []);

  if (!settings) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await updateAiAuthoringSettings({
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        dailyQuota: settings.dailyQuota,
        recipeClientDailyQuota: settings.recipeClientDailyQuota,
        systemPromptOverride: settings.systemPromptOverride?.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTestMsg(null);
    setTesting(true);
    try {
      const r = await testAiConnection({ provider: settings.provider, model: settings.model });
      setTestMsg(
        r.ok
          ? `${t("admin.settings.authoring.testOk")}: ${r.sample ?? ""}`
          : `${t("admin.settings.authoring.testFail")}: ${r.error ?? ""}`,
      );
    } catch (err) {
      setTestMsg(
        `${t("admin.settings.authoring.testFail")}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setTesting(false);
    }
  };

  const input =
    "w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50";
  const label = "block text-sm font-medium text-content-muted mb-2";

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-5 lg:col-span-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-[#00C9FF]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">{t("admin.settings.authoring.title")}</h3>
          <p className="text-sm text-content-muted">{t("admin.settings.authoring.subtitle")}</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-content">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        {t("admin.settings.authoring.enabled")}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>{t("admin.settings.authoring.provider")}</label>
          <select
            className={input}
            value={settings.provider}
            onChange={(e) => set("provider", e.target.value as AiProviderId)}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
                {keys && !keys[p] ? " (no key)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>{t("admin.settings.authoring.model")}</label>
          <input className={input} value={settings.model} onChange={(e) => set("model", e.target.value)} />
        </div>
        <div>
          <label className={label}>{t("admin.settings.authoring.temperature")}</label>
          <input
            className={input}
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={settings.temperature}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) set("temperature", n);
            }}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.authoring.maxOutputTokens")}</label>
          <input
            className={input}
            type="number"
            value={settings.maxOutputTokens}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) set("maxOutputTokens", n);
            }}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.authoring.dailyQuota")}</label>
          <input
            className={input}
            type="number"
            value={settings.dailyQuota}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) set("dailyQuota", n);
            }}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.authoring.recipeClientDailyQuota")}</label>
          <input
            className={input}
            type="number"
            value={settings.recipeClientDailyQuota}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) set("recipeClientDailyQuota", n);
            }}
          />
        </div>
      </div>

      <div>
        <label className={label}>{t("admin.settings.authoring.systemPrompt")}</label>
        <textarea
          className={input}
          rows={3}
          value={settings.systemPromptOverride ?? ""}
          onChange={(e) => set("systemPromptOverride", e.target.value)}
        />
      </div>

      {keys && (
        <p className="text-xs text-content-muted">
          {t("admin.settings.authoring.keyStatus")}:{" "}
          {PROVIDERS.map((p) => `${p}=${keys[p] ? "✓" : "✗"}`).join("  ")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-[#00C9FF] text-black font-medium disabled:opacity-50"
        >
          {t("common.save") || "Save"}
        </button>
        <button
          onClick={test}
          disabled={testing}
          className="px-4 py-2 rounded-xl border border-hairline text-content disabled:opacity-50"
        >
          {t("admin.settings.authoring.testConnection")}
        </button>
        {testMsg && <span className="text-xs text-content-muted">{testMsg}</span>}
      </div>
    </div>
  );
}
