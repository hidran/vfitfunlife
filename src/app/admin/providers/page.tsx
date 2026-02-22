"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { DataTable, FilterBar, VerificationBadge, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { AdminProvider, ProviderFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatPrice } from "@/lib/utils";
import {
  User,
  Star,
  Calendar,
  TrendingUp,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

export default function ProvidersPage() {
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
    setFilters((prev) => ({ ...prev, verificationStatus: status as any, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as any, page: 1 }));
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
      header: "Provider",
      cell: (provider) => (
        <div className="flex items-center gap-3">
          {provider.avatarUrl ? (
            <Image
              src={provider.avatarUrl}
              alt={provider.fullName}
              width={40}
              height={40}
              unoptimized
              className="w-10 h-10 rounded-xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
              <User className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="font-medium text-white">{provider.fullName}</p>
            <p className="text-sm text-white/50">{provider.email}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "type",
      header: "Type",
      cell: (provider) => (
        <span className="text-sm text-white/70 capitalize">
          {provider.providerProfile?.specialties?.[0] || "General"}
        </span>
      ),
      width: "w-24",
    },
    {
      key: "verification",
      header: "Verification",
      cell: (provider) => (
        <VerificationBadge isVerified={provider.providerProfile?.isVerified ?? false} size="sm" />
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "rating",
      header: "Rating",
      cell: (provider) => (
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />
          <span className="text-sm text-white">
            {provider.providerProfile?.rating?.toFixed(1) || "0.0"}
          </span>
          <span className="text-sm text-white/40">
            ({provider.providerProfile?.reviewCount || 0})
          </span>
        </div>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "bookings",
      header: "Bookings",
      cell: (provider) => (
        <span className="text-sm text-white/70">
          {(provider as any).performanceMetrics?.totalBookings || 0}
        </span>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "earnings",
      header: "Earnings",
      cell: (provider) => (
        <span className="text-sm text-white font-medium">
          {formatPrice((provider as any).performanceMetrics?.totalRevenue || 0)}
        </span>
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "status",
      header: "Status",
      cell: (provider) => (
        <StatusBadge
          status={(provider as any).isSuspended ? "suspended" : "active"}
          size="sm"
        />
      ),
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
          <h1 className="text-2xl font-bold text-white">Providers</h1>
          <p className="text-white/50 mt-1">
            Manage service providers and verifications
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => router.push("/admin/providers/verifications")}
        >
          <AlertCircle className="w-4 h-4" />
          Verifications
          {pendingVerifications.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {pendingVerifications.length}
            </span>
          )}
        </Button>
      </div>

      {/* Verification Alert */}
      {pendingVerifications.length > 0 && (
        <div className="bg-gradient-to-r from-[#F59E0B]/20 to-[#F59E0B]/5 rounded-xl border border-[#F59E0B]/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="font-medium text-white">
                {pendingVerifications.length} provider(s) awaiting verification
              </h3>
              <p className="text-sm text-white/50">
                Review and approve provider applications
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push("/admin/providers/verifications")}
            className="flex items-center gap-2"
          >
            Review Now
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        searchPlaceholder="Search providers by name or email..."
        searchValue={filters.search || ""}
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "verificationStatus",
            label: "Verification",
            options: [
              { value: "all", label: "All" },
              { value: "verified", label: "Verified" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
            ],
            value: filters.verificationStatus || "all",
            onChange: handleVerificationStatusChange,
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
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
        onRowClick={(provider) => router.push(`/admin/providers/${provider.id}`)}
        isLoading={isLoadingProviders}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: providersTotal,
          pageSize: filters.limit || 20,
          onPageChange: handlePageChange,
        }}
        emptyMessage="No providers found"
      />
    </div>
  );
}
