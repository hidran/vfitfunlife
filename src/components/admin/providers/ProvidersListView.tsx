"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useShallow } from "zustand/react/shallow";
import {
  DataTable,
  FilterBar,
  StatusBadge,
  ProviderApplicationsPanel,
  ProviderTypeBadge,
} from "@/components/admin";
import { providerVerificationState } from "@/lib/firebase/admin";
import {
  DEFAULT_PROVIDER_FILTERS,
  PROVIDERS_LIST_QUERY_KEY,
  providerFiltersFromParams,
  queryFromProviderFilters,
} from "@/lib/admin/providersListQuery";
import { ProviderOnboardingSettings } from "@/components/admin/settings/ProviderOnboardingSettings";
import { BusinessBadge } from "@/components/provider/BusinessBadge";
import { Button } from "@/components/ui/button";
import { AdminProvider, ProviderFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatDecimal, formatPrice } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  User,
  Star,
  ArrowRight,
  AlertCircle,
  UserPlus,
} from "lucide-react";

/** Sort order of the verification column: work to do first. */
const VERIFICATION_ORDER = { pending: 0, rejected: 1, verified: 2 } as const;

export function ProvidersListView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const {
    providers,
    providersTotal,
    providersFilters,
    pendingVerifications,
    isLoadingProviders,
    fetchProviders,
    fetchPendingVerifications,
  } = useAdminStore(
    useShallow((s) => ({
      providers: s.providers,
      providersTotal: s.providersTotal,
      providersFilters: s.providersFilters,
      pendingVerifications: s.pendingVerifications,
      isLoadingProviders: s.isLoadingProviders,
      fetchProviders: s.fetchProviders,
      fetchPendingVerifications: s.fetchPendingVerifications,
    }))
  );

  const searchParams = useSearchParams();
  // Seeded from the URL so a reload, or coming back from a provider's page, keeps the filters.
  const [filters, setFilters] = useState<ProviderFilters>(() =>
    providerFiltersFromParams(searchParams)
  );
  // The search box's text; it reaches `filters` only once typing pauses (see UsersListView).
  const [searchInput, setSearchInput] = useState(() => filters.search ?? "");
  const applySearch = useDebouncedCallback((search: string) =>
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  );

  useEffect(() => {
    fetchProviders(filters);
  }, [filters, fetchProviders]);

  // The pending-verification counter does not depend on the list filters: load it once,
  // not on every filter change or keystroke.
  useEffect(() => {
    fetchPendingVerifications();
  }, [fetchPendingVerifications]);

  // replaceState rather than router.replace, as in UsersListView: no navigation per change.
  useEffect(() => {
    const query = queryFromProviderFilters(filters);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    try {
      sessionStorage.setItem(PROVIDERS_LIST_QUERY_KEY, query);
    } catch {
      // Storage unavailable: the URL still carries the filters.
    }
  }, [filters]);

  const handleSearchChange = (search: string) => {
    setSearchInput(search);
    if (search) {
      applySearch.run(search);
    } else {
      // Clearing the box is a deliberate action, not typing: apply it at once.
      applySearch.cancel();
      setFilters((prev) => (prev.search ? { ...prev, search: "", page: 1 } : prev));
    }
  };

  const handleVerificationStatusChange = (status: string) => {
    setFilters((prev) => ({
      ...prev,
      verificationStatus: status as ProviderFilters["verificationStatus"],
      page: 1,
    }));
  };

  const handleProviderTypeChange = (providerType: string) => {
    setFilters((prev) => ({
      ...prev,
      providerType: providerType as ProviderFilters["providerType"],
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
    setSearchInput("");
    applySearch.cancel();
    setFilters(DEFAULT_PROVIDER_FILTERS);
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
          <div className="min-w-0">
            <p className="font-medium text-content">{provider.fullName}</p>
            <p className="text-sm text-content-muted">{provider.email}</p>
            {/* users.providerType is server-written only (never on an owner allowlist), so
                it can mark a company here; the badge is text + icon, not colour alone. */}
            {provider.providerType === "business" && <BusinessBadge className="mt-1" />}
          </div>
        </div>
      ),
      sortValue: (provider) => provider.fullName || provider.email,
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
      // Three states, not a verified/unverified pair: a rejected applicant is not "pending".
      cell: (provider) => (
        <StatusBadge status={providerVerificationState(provider)} size="sm" />
      ),
      sortValue: (provider) => VERIFICATION_ORDER[providerVerificationState(provider)],
      width: "w-28",
    },
    {
      key: "rating",
      header: t("admin.providers.col.rating"),
      cell: (provider) => (
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-[#F59E0B] light:text-amber-700 fill-[#F59E0B] light:fill-amber-600" />
          <span className="text-sm text-content">
            {formatDecimal(provider.providerProfile?.rating ?? 0, locale, 1)}
          </span>
          <span className="text-sm text-content-faint">
            ({provider.providerProfile?.reviewCount || 0})
          </span>
        </div>
      ),
      sortValue: (provider) => provider.providerProfile?.rating ?? 0,
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
      sortValue: (provider) => provider.performanceMetrics?.totalBookings ?? 0,
      width: "w-24",
    },
    {
      key: "earnings",
      header: t("admin.providers.col.earnings"),
      cell: (provider) => {
        const metrics = (provider as AdminProvider).performanceMetrics;
        return (
          <span className="text-sm text-content font-medium">
            {formatPrice(metrics?.totalRevenue || 0, locale)}
          </span>
        );
      },
      sortValue: (provider) => provider.performanceMetrics?.totalRevenue ?? 0,
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
      sortValue: (provider) =>
        (provider as AdminProvider & { isSuspended?: boolean }).isSuspended ? "suspended" : "active",
      width: "w-24",
    },
  ];

  const totalPages = Math.ceil(providersTotal / (filters.limit || 20));

  // A `?page=N` past the end (a stale link, or the list shrank) would show an empty table with
  // no pager to get back: once this query's total is in, step back to its last page. Adjusted
  // during render (React's "storing information from previous renders" pattern) rather than in
  // an effect; `providersFilters === filters` makes sure the total belongs to these filters, and the
  // new filters object makes the condition false on the very next render.
  if (
    providersFilters === filters &&
    !isLoadingProviders &&
    providersTotal > 0 &&
    (filters.page || 1) > totalPages
  ) {
    setFilters({ ...filters, page: totalPages });
  }

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
              <span className="ml-1 px-2 py-0.5 bg-content/20 rounded-full text-xs">
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
              <AlertCircle className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />
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
        searchValue={searchInput}
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
          {
            key: "providerType",
            label: t("admin.providers.filter.accountType"),
            options: [
              { value: "all", label: t("admin.providers.filter.allAccounts") },
              { value: "individual", label: t("admin.providers.filter.individuals") },
              { value: "business", label: t("admin.providers.filter.companies") },
            ],
            value: filters.providerType || "all",
            onChange: handleProviderTypeChange,
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
          onPageSizeChange: (limit) => setFilters((prev) => ({ ...prev, limit, page: 1 })),
        }}
        emptyMessage={t("admin.providers.empty")}
      />
    </div>
  );
}
