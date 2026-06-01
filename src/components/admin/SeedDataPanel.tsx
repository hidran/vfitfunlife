"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { useI18n } from "@/hooks/useI18n";
import { getFunctions, httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import {
  Database,
  Trash2,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw
} from "lucide-react";

interface SeedingResult {
  success: boolean;
  summary?: {
    totalCollections: number;
    successful: number;
    failed: number;
    totalRecords?: number;
    totalDeleted?: number;
  };
  details?: Array<{
    success: boolean;
    collection: string;
    count: number;
    error?: string;
  }>;
  message?: string;
  error?: string;
}

export function SeedDataPanel() {
  const { t } = useI18n();
  const { firebaseUser } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<SeedingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callSeedFunction = async (functionName: string): Promise<SeedingResult> => {
    if (!firebaseUser) {
      throw new Error("Not authenticated");
    }

    // Get fresh ID token
    const idToken = await firebaseUser.getIdToken(true);
    
    // Use direct HTTP call instead of callable for better control
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  };

  const handleSeedQuick = async () => {
    setLoading("quick");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("seedQuickData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleSeedAll = async () => {
    setLoading("all");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("seedAllData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(t('admin.seed.clearAll.confirm'))) {
      return;
    }
    
    setLoading("clear");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("clearAllData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-content">{t('admin.seed.title')}</h2>
        <p className="text-gray-400 mt-1">
          {t('admin.seed.subtitle')}
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quick Seed */}
        <div className="bg-[#2A2D3A] rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.seed.quickSeed.title')}</h3>
              <p className="text-xs text-gray-400">{t('admin.seed.quickSeed.subtitle')}</p>
            </div>
          </div>

          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li>• {t('admin.seed.quickSeed.providers')}</li>
            <li>• {t('admin.seed.quickSeed.customers')}</li>
            <li>• {t('admin.seed.quickSeed.venues')}</li>
            <li>• {t('admin.seed.quickSeed.classes')}</li>
            <li>• {t('admin.seed.quickSeed.bookings')}</li>
            <li>• {t('admin.seed.quickSeed.reviews')}</li>
          </ul>

          <Button
            onClick={handleSeedQuick}
            disabled={loading === "quick"}
            variant="secondary"
            fullWidth
          >
            {loading === "quick" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('admin.seed.seeding')}
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('admin.seed.quickSeed.button')}
              </>
            )}
          </Button>
        </div>

        {/* Full Seed */}
        <div className="bg-[#2A2D3A] rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.seed.fullSeed.title')}</h3>
              <p className="text-xs text-gray-400">{t('admin.seed.fullSeed.subtitle')}</p>
            </div>
          </div>

          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li>• {t('admin.seed.fullSeed.providers')}</li>
            <li>• {t('admin.seed.fullSeed.customers')}</li>
            <li>• {t('admin.seed.fullSeed.venues')}</li>
            <li>• {t('admin.seed.fullSeed.classes')}</li>
            <li>• {t('admin.seed.fullSeed.bookings')}</li>
            <li>• {t('admin.seed.fullSeed.reviews')}</li>
          </ul>

          <Button
            onClick={handleSeedAll}
            disabled={loading === "all"}
            variant="primary"
            fullWidth
          >
            {loading === "all" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('admin.seed.seeding')}
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                {t('admin.seed.fullSeed.button')}
              </>
            )}
          </Button>
        </div>

        {/* Clear Data */}
        <div className="bg-[#2A2D3A] rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.seed.clearAll.title')}</h3>
              <p className="text-xs text-gray-400">{t('admin.seed.clearAll.subtitle')}</p>
            </div>
          </div>

          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li className="text-red-400">• ⚠️ {t('admin.seed.clearAll.users')}</li>
            <li className="text-red-400">• ⚠️ {t('admin.seed.clearAll.venues')}</li>
            <li className="text-red-400">• ⚠️ {t('admin.seed.clearAll.classes')}</li>
            <li className="text-red-400">• ⚠️ {t('admin.seed.clearAll.bookings')}</li>
            <li className="text-red-400">• ⚠️ {t('admin.seed.clearAll.reviews')}</li>
          </ul>

          <Button
            onClick={handleClearAll}
            disabled={loading === "clear"}
            variant="ghost"
            className="w-full border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {loading === "clear" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('admin.seed.clearing')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {t('admin.seed.clearAll.button')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-400">{t('admin.seed.error.title')}</h4>
            <p className="text-sm text-red-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success Result */}
      {result?.success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h4 className="font-medium text-green-400">{t('admin.seed.success.title')}</h4>
          </div>
          
          {result.message && (
            <p className="text-sm text-green-300 mb-3">{result.message}</p>
          )}
          
          {result.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="bg-surface-sunken rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-content">
                  {result.summary.totalCollections}
                </p>
                <p className="text-xs text-gray-400">{t('admin.seed.result.collections')}</p>
              </div>
              <div className="bg-surface-sunken rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {result.summary.successful}
                </p>
                <p className="text-xs text-gray-400">{t('admin.seed.result.successful')}</p>
              </div>
              <div className="bg-surface-sunken rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-content">
                  {result.summary.totalRecords ?? result.summary.totalDeleted ?? 0}
                </p>
                <p className="text-xs text-gray-400">
                  {result.summary.totalRecords ? t('admin.seed.result.records') : t('admin.seed.result.deleted')}
                </p>
              </div>
              <div className="bg-surface-sunken rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">
                  {result.summary.failed}
                </p>
                <p className="text-xs text-gray-400">{t('admin.seed.result.failed')}</p>
              </div>
            </div>
          )}
          
          {/* Details */}
          {result.details && result.details.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-content mb-2">{t('admin.seed.result.details')}</p>
              <div className="space-y-1">
                {result.details.map((detail) => (
                  <div
                    key={detail.collection}
                    className="flex items-center justify-between text-sm py-1 px-2 rounded bg-surface-sunken"
                  >
                    <span className="text-gray-300 capitalize">
                      {detail.collection}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-content font-medium">
                        {detail.count}
                      </span>
                      {detail.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
