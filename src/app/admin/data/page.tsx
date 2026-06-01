"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { toLocaleTag } from "@/types/locale";
import {
  Database,
  Trash2,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
  History,
  Shield,
} from "lucide-react";

interface OperationResult {
  success: boolean;
  summary?: {
    totalRecords?: number;
    totalDeleted?: number;
  };
  error?: string;
}

interface Operation {
  id: string;
  type: "quick" | "full" | "clear";
  status: "running" | "completed" | "failed";
  result?: OperationResult;
  error?: string;
  timestamp: Date;
}

export default function DataManagementPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user, firebaseUser } = useAuthStore();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<"quick" | "full" | "clear" | null>(null);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "superadmin") {
      router.push("/admin");
    }
  }, [user, router]);

  const callSeedFunction = async (functionName: string): Promise<OperationResult> => {
    if (!firebaseUser) {
      throw new Error("Not authenticated");
    }

    const idToken = await firebaseUser.getIdToken(true);
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
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

  const runOperation = async (type: "quick" | "full" | "clear") => {
    const operationId = `${type}_${Date.now()}`;
    const functionMap = {
      quick: "seedQuickData",
      full: "seedAllData",
      clear: "clearAllData",
    };

    const newOperation: Operation = {
      id: operationId,
      type,
      status: "running",
      timestamp: new Date(),
    };
    setOperations((prev) => [newOperation, ...prev]);
    setCurrentOperation(operationId);
    setShowConfirmDialog(null);

    try {
      const result = await callSeedFunction(functionMap[type]);
      setOperations((prev) =>
        prev.map((op) =>
          op.id === operationId ? { ...op, status: "completed", result } : op
        )
      );
    } catch (error: any) {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === operationId ? { ...op, status: "failed", error: error.message } : op
        )
      );
    } finally {
      setCurrentOperation(null);
    }
  };

  const getOperationLabel = (type: string) => {
    switch (type) {
      case "quick": return t('admin.data.operationLabel.quick');
      case "full": return t('admin.data.operationLabel.full');
      case "clear": return t('admin.data.operationLabel.clear');
      default: return type;
    }
  };

  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.data.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.data.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <Shield className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-400">
            {user?.role === "superadmin" ? t('admin.data.accessLabel.superadmin') : t('admin.data.accessLabel.admin')}
          </span>
        </div>
      </div>

      {/* Operation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Seed */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.data.quickSeed.title')}</h3>
              <p className="text-xs text-content-muted">{t('admin.data.quickSeed.subtitle')}</p>
            </div>
          </div>
          <Button
            onClick={() => setShowConfirmDialog("quick")}
            disabled={!!currentOperation}
            variant="secondary"
            fullWidth
          >
            {currentOperation?.startsWith("quick") ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('admin.data.quickSeed.running')}</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" /> {t('admin.data.quickSeed.run')}</>
            )}
          </Button>
        </div>

        {/* Full Seed */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Database className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.data.fullSeed.title')}</h3>
              <p className="text-xs text-content-muted">{t('admin.data.fullSeed.subtitle')}</p>
            </div>
          </div>
          <Button
            onClick={() => setShowConfirmDialog("full")}
            disabled={!!currentOperation}
            variant="primary"
            fullWidth
          >
            {currentOperation?.startsWith("full") ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('admin.data.fullSeed.running')}</>
            ) : (
              <><Database className="w-4 h-4 mr-2" /> {t('admin.data.fullSeed.run')}</>
            )}
          </Button>
        </div>

        {/* Clear Data */}
        <div className="bg-surface rounded-2xl border border-red-500/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-content">{t('admin.data.clearAll.title')}</h3>
              <p className="text-xs text-red-400/70">{t('admin.data.clearAll.superadminOnly')}</p>
            </div>
          </div>
          <Button
            onClick={() => setShowConfirmDialog("clear")}
            disabled={!!currentOperation || user?.role !== "superadmin"}
            variant="ghost"
            fullWidth
            className="border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {currentOperation?.startsWith("clear") ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('admin.data.clearAll.running')}</>
            ) : (
              <><Trash2 className="w-4 h-4 mr-2" /> {t('admin.data.clearAll.run')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface rounded-2xl border border-hairline p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-content mb-2">
              {t('admin.data.confirm.title', { label: getOperationLabel(showConfirmDialog) })}
            </h3>
            <p className="text-sm text-content-muted mb-6">
              {showConfirmDialog === "clear"
                ? t('admin.data.confirm.messageClear')
                : t('admin.data.confirm.messageSeed')}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowConfirmDialog(null)} fullWidth>
                {t('admin.data.confirm.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => runOperation(showConfirmDialog)}
                className={showConfirmDialog === "clear" ? "bg-red-500 hover:bg-red-600" : ""}
                fullWidth
              >
                {t('admin.data.confirm.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Operation History */}
      {operations.length > 0 && (
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center gap-3 mb-6">
            <History className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-content">{t('admin.data.history.title')}</h3>
          </div>
          <div className="space-y-3">
            {operations.map((op) => (
              <div
                key={op.id}
                className={cn(
                  "border rounded-xl p-4",
                  op.status === "running" && "border-blue-500/30 bg-blue-500/5",
                  op.status === "completed" && "border-green-500/30 bg-green-500/5",
                  op.status === "failed" && "border-red-500/30 bg-red-500/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {op.status === "running" ? (
                      <Loader2 className="w-5 h-5 animate-spin text-content" />
                    ) : op.status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <p className="font-medium text-content">{getOperationLabel(op.type)}</p>
                      <p className="text-xs text-content-muted">{op.timestamp.toLocaleTimeString(toLocaleTag(locale))}</p>
                    </div>
                  </div>
                  {op.result?.summary && (
                    <div className="text-right">
                      <p className="text-lg font-semibold text-content">
                        {op.result.summary.totalRecords ?? op.result.summary.totalDeleted ?? 0}
                      </p>
                      <p className="text-xs text-content-muted">
                        {op.result.summary.totalRecords ? t('admin.data.history.records') : t('admin.data.history.deleted')}
                      </p>
                    </div>
                  )}
                </div>
                {op.error && (
                  <p className="mt-2 text-sm text-red-400">{op.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
