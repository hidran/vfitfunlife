"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminStore } from "@/stores/adminStore";
import { useShallow } from "zustand/react/shallow";
import { VerificationQueue } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import type { BusinessReview } from "@/lib/firebase/functions";
import { adminBusinessErrorCode, ADMIN_BUSINESS_ERRORS } from "@/lib/providerApplicationErrors";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function ProviderVerificationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { pendingVerifications, fetchPendingVerifications, verifyProviderAction, rejectProviderAction } = useAdminStore(
    useShallow((s) => ({
      pendingVerifications: s.pendingVerifications,
      fetchPendingVerifications: s.fetchPendingVerifications,
      verifyProviderAction: s.verifyProviderAction,
      rejectProviderAction: s.rejectProviderAction,
    }))
  );
  // Approving is superadmin-only and now goes through a callable that can refuse. Swallowing
  // that into the console told the admin the same story as success — the row simply stayed.
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchPendingVerifications();
  }, [fetchPendingVerifications]);

  const handleApprove = async (providerId: string, expectedReview?: BusinessReview) => {
    setActionError(null);
    try {
      await verifyProviderAction(providerId, {
        status: "verified",
        verifiedAt: Timestamp.now(),
        ...(expectedReview ? { expectedReview } : {}),
      });
    } catch (error) {
      console.error("Failed to approve provider:", error);
      const code = adminBusinessErrorCode(error);
      if (code === "stale_review" || code === "review_required") {
        // The company changed since its row was opened: say so, and reload the queue and
        // the company details so the admin reviews what is there now.
        setActionError(t(ADMIN_BUSINESS_ERRORS[code]));
        await Promise.all([
          fetchPendingVerifications(),
          queryClient.invalidateQueries({ queryKey: ["providers"] }),
        ]);
        return;
      }
      setActionError(t(code ? ADMIN_BUSINESS_ERRORS[code] : 'admin.verificationsPage.actionFailed'));
    }
  };

  const handleReject = async (providerId: string, reason: string) => {
    setActionError(null);
    try {
      await rejectProviderAction(providerId, reason);
    } catch (error) {
      console.error("Failed to reject provider:", error);
      setActionError(t('admin.verificationsPage.actionFailed'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/providers")}
          className="text-content-muted"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('admin.verificationsPage.back')}
        </Button>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400 light:text-red-700">
          {actionError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.verificationsPage.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.verificationsPage.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-[#F59E0B] light:text-amber-700" />
            <span className="text-sm text-[#F59E0B] light:text-amber-700">
              {t('admin.verificationsPage.pendingBadge', { count: String(pendingVerifications.length) })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />
            </div>
            <div>
              <p className="text-sm text-content-muted">{t('admin.verificationsPage.stat.pending')}</p>
              <p className="text-xl font-bold text-content">{pendingVerifications.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#10B981] light:text-emerald-700" />
            </div>
            <div>
              <p className="text-sm text-content-muted">{t('admin.verificationsPage.stat.verifiedToday')}</p>
              <p className="text-xl font-bold text-content">0</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />
            </div>
            <div>
              <p className="text-sm text-content-muted">{t('admin.verificationsPage.stat.avgResponseTime')}</p>
              <p className="text-xl font-bold text-content">2.5h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Queue */}
      <VerificationQueue
        providers={pendingVerifications}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
