"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import {
  DataTable,
  FilterBar,
  VerificationBadge,
  StatusBadge,
  ProviderApplicationsPanel,
  ProviderTypeBadge,
} from "@/components/admin";
import { ProviderOnboardingSettings } from "@/components/admin/settings/ProviderOnboardingSettings";
import { Button } from "@/components/ui/button";
import { AdminProvider, ProviderFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatPrice } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  User,
  Star,
  ArrowRight,
  AlertCircle,
  UserPlus,
} from "lucide-react";

export function ProvidersListView() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    providers,
    providersTotal,
    pendingVerifications,
    isLoadingProviders,
    fetchProviders,
    fetchPendingVerifications,
  } = useAdminStore();

  const [filters, setFilters] = useState<ProviderFilters>({
    verificationStatus: "all",
    status: "all",
    search: "",
    page: 1,
    limit: 20,
  });

  useEffect(() => {
    fetchProviders(filters);
    fetchPendingVerifications();
  }, [filters, fetchProviders, fetchPendingVerifications]);

  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  };

  const handleVerificationStatusChange = (status: string) => {
    setFilters((prev) => ({
      ...prev,
      verificationStatus: status as ProviderFilters["verificationStatus"],
      page: 1,
    }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({
      ...prev,
      status: status as ProviderFilters["status"],
      page: 1,
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleClearFilters = () => {
    setFilters({
      verificationStatus: "all",
      status: "all",
      search: "",
      page: 1,
      limit: 20,
    });
  };

  const columns: Column<AdminProvider>[] = [
    {
      key: "provider",
      header: t("admin.providers.col.provider"),
      cell: (provider) => (
        <div className="flex items-center gap-3">
          {provider.avatarUrl ? (
            <Image
              src={provider.avatarUrl}
              alt={provider.fullName}
              width={40}
              height={40}
              unoptimized
              className="w-10 h-10 rounded-xl object-cover border border-hairline"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
              <User className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="font-medium text-content">{provider.fullName}</p>
            <p className="text-sm text-content-muted">{provider.email}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "type",
      header: t("admin.providers.col.type"),
      cell: (provider) => (
        <ProviderTypeBadge userType={provider.userType} size="sm" />
      ),
      width: "w-36",
    },
    {
      key: "verification",
      header: t("admin.providers.col.verification"),
      cell: (provider) => (
        <VerificationBadge
          isVerified={provider.providerProfile?.isVerified ?? false}
          size="sm"
        />
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "rating",
      header: t("admin.providers.col.rating"),
      cell: (provider) => (
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />
          <span className="text-sm text-content">
            {provider.providerProfile?.rating?.toFixed(1) || "0.0"}
          </span>
          <span className="text-sm text-content-faint">
            ({provider.providerProfile?.reviewCount || 0})
          </span>
        </div>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "bookings",
      header: t("admin.providers.col.bookings"),
      cell: (provider) => {
        const metrics = (provider as AdminProvider).performanceMetrics;
        return (
          <span className="text-sm text-content-muted">
            {metrics?.totalBookings || 0}
          </span>
        );
      },
      sortable: true,
      width: "w-24",
    },
    {
      key: "earnings",
      header: t("admin.providers.col.earnings"),
      cell: (provider) => {
        const metrics = (provider as AdminProvider).performanceMetrics;
        return (
          <span className="text-sm text-content font-medium">
            {formatPrice(metrics?.totalRevenue || 0)}
          </span>
        );
      },
      sortable: true,
      width: "w-28",
    },
    {
      key: "status",
      header: t("admin.providers.col.status"),
      cell: (provider) => {
        const isSuspended = (provider as AdminProvider & {
          isSuspended?: boolean;
        }).isSuspended;
        return (
          <StatusBadge status={isSuspended ? "suspended" : "active"} size="sm" />
        );
      },
      sortable: true,
      width: "w-24",
    },
  ];

  const totalPages = Math.ceil(providersTotal / (filters.limit || 20));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">
            {t("admin.providers.title")}
          </h1>
          <p className="text-content-muted mt-1">{t("admin.providers.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="flex items-center gap-2"
            onClick={() => router.push("/admin/providers/verifications")}
          >
            <AlertCircle className="w-4 h-4" />
            {t("admin.providers.verificationsBtn")}
            {pendingVerifications.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {pendingVerifications.length}
              </span>
            )}
          </Button>
          <Button
            variant="primary"
            className="flex items-center gap-2"
            onClick={() => router.push("/admin/providers/?id=new")}
          >
            <UserPlus className="w-4 h-4" />
            {t("admin.providers.addProvider")}
          </Button>
        </div>
      </div>

      {/* Verification Alert */}
      {pendingVerifications.length > 0 && (
        <div className="bg-gradient-to-r from-[#F59E0B]/20 to-[#F59E0B]/5 rounded-xl border border-[#F59E0B]/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="font-medium text-content">
                {t("admin.providers.alert.awaitingVerification", {
                  count: String(pendingVerifications.length),
                })}
              </h3>
              <p className="text-sm text-content-muted">
                {t("admin.providers.alert.reviewMessage")}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push("/admin/providers/verifications")}
            className="flex items-center gap-2"
          >
            {t("admin.providers.alert.reviewNow")}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Pending provider self-registration applications */}
      {/* The switch that decides whether that queue receives anything at all. It lives
          here, not in /admin/settings: that page is superadmin-only, and provider
          onboarding is admin work. */}
      <ProviderOnboardingSettings />
      <ProviderApplicationsPanel />

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t("admin.providers.search")}
        searchValue={filters.search || ""}
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "verificationStatus",
            label: t("admin.providers.filter.verification"),
            options: [
              { value: "all", label: t("admin.providers.filter.all") },
              { value: "verified", label: t("admin.providers.filter.verified") },
              { value: "pending", label: t("admin.providers.filter.pending") },
              { value: "rejected", label: t("admin.providers.filter.rejected") },
            ],
            value: filters.verificationStatus || "all",
            onChange: handleVerificationStatusChange,
          },
          {
            key: "status",
            label: t("admin.providers.filter.status"),
            options: [
              { value: "all", label: t("admin.providers.filter.allStatus") },
              { value: "active", label: t("admin.providers.filter.active") },
              { value: "suspended", label: t("admin.providers.filter.suspended") },
            ],
            value: filters.status || "all",
            onChange: handleStatusChange,
          },
        ]}
        onClearFilters={handleClearFilters}
      />

      {/* Data Table */}
      <DataTable
        data={providers}
        columns={columns}
        keyExtractor={(provider) => provider.id}
        onRowClick={(provider) =>
          router.push(`/admin/providers/?id=${provider.id}`)
        }
        isLoading={isLoadingProviders}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: providersTotal,
          pageSize: filters.limit || 20,
          onPageChange: handlePageChange,
        }}
        emptyMessage={t("admin.providers.empty")}
      />
    </div>
  );
}
