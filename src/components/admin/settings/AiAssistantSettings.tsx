"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { getAiSettingsAdmin, updateAiSettings, testAiConnection } from "@/lib/firebase/functions";
import type { AiAssistantSettings as Settings, AiProviderId } from "@/types/assistant";

const PROVIDERS: AiProviderId[] = ["anthropic", "openai", "google", "openai-compatible"];

export function AiAssistantSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<Record<AiProviderId, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    getAiSettingsAdmin()
      .then((r) => {
        setSettings(r.settings);
        setKeys(r.keyPresence);
      })
      .catch(() => {});
  }, []);

  if (!settings) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const models = settings.availableModels[settings.provider] ?? [];

  const save = async () => {
    setSaving(true);
    try {
      await updateAiSettings({
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        maxContextMessages: settings.maxContextMessages,
        maxInputChars: settings.maxInputChars,
        dailyMessageQuota: settings.dailyMessageQuota,
        systemPromptOverride: settings.systemPromptOverride,
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTestMsg(null);
    const r = await testAiConnection({ provider: settings.provider, model: settings.model });
    setTestMsg(
      r.ok
        ? `${t("admin.settings.ai.testOk")}: ${r.sample ?? ""}`
        : `${t("admin.settings.ai.testFail")}: ${r.error ?? ""}`,
    );
  };

  const input =
    "w-full px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50";
  const label = "block text-sm font-medium text-content-muted mb-2";

  return (
    <div className="bg-surface rounded-2xl border border-hairline p-6 space-y-5 lg:col-span-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#00C9FF]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-content">{t("admin.settings.ai.title")}</h3>
          <p className="text-sm text-content-muted">{t("admin.settings.ai.subtitle")}</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-content">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        {t("admin.settings.ai.enabled")}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>{t("admin.settings.ai.provider")}</label>
          <select
            className={input}
            value={settings.provider}
            onChange={(e) => {
              const p = e.target.value as AiProviderId;
              setSettings({
                ...settings,
                provider: p,
                model: (settings.availableModels[p] ?? [])[0] ?? settings.model,
              });
            }}
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
          <label className={label}>{t("admin.settings.ai.model")}</label>
          {models.length ? (
            <select className={input} value={settings.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input className={input} value={settings.model} onChange={(e) => set("model", e.target.value)} />
          )}
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.temperature")}</label>
          <input
            className={input}
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={settings.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.maxOutputTokens")}</label>
          <input
            className={input}
            type="number"
            value={settings.maxOutputTokens}
            onChange={(e) => set("maxOutputTokens", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.maxContextMessages")}</label>
          <input
            className={input}
            type="number"
            value={settings.maxContextMessages}
            onChange={(e) => set("maxContextMessages", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>{t("admin.settings.ai.dailyQuota")}</label>
          <input
            className={input}
            type="number"
            value={settings.dailyMessageQuota}
            onChange={(e) => set("dailyMessageQuota", Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className={label}>{t("admin.settings.ai.systemPrompt")}</label>
        <textarea
          className={input}
          rows={3}
          value={settings.systemPromptOverride ?? ""}
          onChange={(e) => set("systemPromptOverride", e.target.value)}
        />
      </div>

      {keys && (
        <p className="text-xs text-content-muted">
          {t("admin.settings.ai.keyStatus")}:{" "}
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
        <button onClick={test} className="px-4 py-2 rounded-xl border border-hairline text-content">
          {t("admin.settings.ai.testConnection")}
        </button>
        {testMsg && <span className="text-xs text-content-muted">{testMsg}</span>}
      </div>
    </div>
  );
}
