"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useAdminStore } from "@/stores/adminStore";
import { VerificationQueue } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function ProviderVerificationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    pendingVerifications,
    fetchPendingVerifications,
    verifyProviderAction,
    rejectProviderAction,
  } = useAdminStore();

  useEffect(() => {
    fetchPendingVerifications();
  }, [fetchPendingVerifications]);

  const handleApprove = async (providerId: string) => {
    try {
      await verifyProviderAction(providerId, {
        status: "verified",
        verifiedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("Failed to approve provider:", error);
    }
  };

  const handleReject = async (providerId: string, reason: string) => {
    try {
      await rejectProviderAction(providerId, reason);
    } catch (error) {
      console.error("Failed to reject provider:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/providers")}
          className="text-white/60"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('admin.verificationsPage.back')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.verificationsPage.title')}</h1>
          <p className="text-white/50 mt-1">
            {t('admin.verificationsPage.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
            <span className="text-sm text-[#F59E0B]">
              {t('admin.verificationsPage.pendingBadge', { count: String(pendingVerifications.length) })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-sm text-white/50">{t('admin.verificationsPage.stat.pending')}</p>
              <p className="text-xl font-bold text-white">{pendingVerifications.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <p className="text-sm text-white/50">{t('admin.verificationsPage.stat.verifiedToday')}</p>
              <p className="text-xl font-bold text-white">0</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <p className="text-sm text-white/50">{t('admin.verificationsPage.stat.avgResponseTime')}</p>
              <p className="text-xl font-bold text-white">2.5h</p>
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
