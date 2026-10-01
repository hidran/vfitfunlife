"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  BOOKING_DISPUTED_FILTER,
  DEFAULT_BOOKING_FILTERS,
  bookingFiltersFromParams,
  queryFromBookingFilters,
} from "@/lib/admin/bookingsListQuery";
import { fromDateParam, toDateParam } from "@/lib/admin/usersListQuery";
import { useAdminStore } from "@/stores/adminStore";
import { useShallow } from "zustand/react/shallow";
import { BOOKING_STATUS_META } from "@/lib/bookingStatus";
import type { BookingStatus } from "@/types/firebase";
import type { MessageKey } from "@/i18n/messages";
import { DataTable, FilterBar, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { BookingFilters } from "@/types/admin";
import { Booking as BookingType } from "@/types/firebase";
import { Column } from "@/components/admin/DataTable";
import { formatPrice, formatDate, toDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  Calendar,
  User,
  Store,
  CreditCard,
  Download,
} from "lucide-react";

export function BookingsListView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { bookings, bookingsTotal, bookingsFilters, isLoadingBookings, error, fetchBookings } =
    useAdminStore(
      useShallow((s) => ({
        bookings: s.bookings,
        bookingsTotal: s.bookingsTotal,
        bookingsFilters: s.bookingsFilters,
        isLoadingBookings: s.isLoadingBookings,
        error: s.error,
        fetchBookings: s.fetchBookings,
      }))
    );

  const searchParams = useSearchParams();
  // Seeded from the URL so a reload, or coming back from a booking's page, keeps the filters.
  const [filters, setFilters] = useState<BookingFilters>(() => bookingFiltersFromParams(searchParams));
  // What the search box shows; it reaches `filters` (the fetch and the URL) once typing pauses.
  const [searchInput, setSearchInput] = useState(() => filters.search ?? "");
  const applySearch = useDebouncedCallback((search: string) =>
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  );

  useEffect(() => {
    fetchBookings(filters);
  }, [filters, fetchBookings]);

  // replaceState rather than router.replace: no navigation per filter change (see UsersListView).
  useEffect(() => {
    const query = queryFromBookingFilters(filters);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters]);

  const handleSearchChange = (search: string) => {
    setSearchInput(search);
    if (search) {
      applySearch.run(search);
    } else {
      applySearch.cancel();
      setFilters((prev) => (prev.search ? { ...prev, search: "", page: 1 } : prev));
    }
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as BookingFilters["status"], page: 1 }));
  };

  // FilterBar hands back local-midnight dates; the "to" day is included up to its last moment.
  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    setFilters((prev) => {
      const next: BookingFilters = { ...prev, page: 1 };
      delete next.dateFrom;
      delete next.dateTo;
      if (from) next.dateFrom = fromDateParam(toDateParam(from));
      if (to) next.dateTo = fromDateParam(toDateParam(to), true);
      return next;
    });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (limit: number) => {
    setFilters((prev) => ({ ...prev, limit, page: 1 }));
  };

  const handleClearFilters = () => {
    setSearchInput("");
    applySearch.cancel();
    setFilters(DEFAULT_BOOKING_FILTERS);
  };

  const columns: Column<BookingType>[] = [
    {
      key: "bookingId",
      header: t('admin.bookings.col.bookingId'),
      cell: (booking) => (
        <div>
          <p className="font-medium text-content">#{booking.id.slice(-6).toUpperCase()}</p>
          <p className="text-xs text-content-faint">
            {formatDate(toDate(booking.createdAt) || new Date(), {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ),
      width: "w-32",
    },
    {
      key: "customer",
      header: t('admin.bookings.col.customer'),
      cell: (booking) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white text-sm font-semibold">
            <User className="w-4 h-4" />
          </div>
          <div>
            <p className="font-medium text-content text-sm">{booking.userName}</p>
            <p className="text-xs text-content-muted">{booking.userPhone}</p>
          </div>
        </div>
      ),
      width: "w-1/5",
    },
    {
      key: "provider",
      header: t('admin.bookings.col.provider'),
      cell: (booking) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
            <Store className="w-4 h-4 text-content-muted" />
          </div>
          <div>
            <p className="font-medium text-content text-sm">{booking.instructorName}</p>
            <p className="text-xs text-content-muted">{booking.venueName}</p>
          </div>
        </div>
      ),
      width: "w-1/5",
    },
    {
      key: "service",
      header: t('admin.bookings.col.service'),
      cell: (booking) => (
        <div>
          <p className="text-sm text-content">{booking.serviceName}</p>
          <p className="text-xs text-content-muted">
            {formatDate(toDate(booking.scheduledAt) || new Date(), {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ),
      width: "w-1/5",
    },
    {
      key: "amount",
      header: t('admin.bookings.col.amount'),
      cell: (booking) => (
        <span className="font-medium text-content">
          {formatPrice(booking.finalPrice || 0, locale)}
        </span>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: t('admin.bookings.col.status'),
      cell: (booking) => <StatusBadge status={booking.status as never} size="sm" />,
      sortable: true,
      width: "w-28",
    },
    {
      key: "payment",
      header: t('admin.bookings.col.payment'),
      cell: (booking) => (
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-content-faint" />
          <span className="text-sm text-content-muted capitalize">{booking.paymentStatus}</span>
        </div>
      ),
      width: "w-28",
    },
  ];

  const totalPages = Math.ceil(bookingsTotal / (filters.limit || 20));

  // A `?page=N` past the end steps back to the last page once this query's total is in —
  // same render-time adjustment as UsersListView.
  if (
    bookingsFilters === filters &&
    !isLoadingBookings &&
    bookingsTotal > 0 &&
    (filters.page || 1) > totalPages
  ) {
    setFilters({ ...filters, page: totalPages });
  }

  // These three describe the rows on this page, not the whole filtered list.
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.finalPrice || 0), 0);
  const pendingCount = bookings.filter((b) => b.status === "requested").length;
  const completedCount = bookings.filter((b) => b.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.bookings.title')}</h1>
          <p className="text-content-muted mt-1">{t('admin.bookings.subtitle')}</p>
        </div>
        <Button variant="secondary" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          {t('admin.bookings.export')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.bookings.stat.totalBookings')}</p>
              <p className="text-xl font-bold text-content">{bookingsTotal}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#10B981] light:text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.bookings.stat.totalRevenue')}</p>
              <p className="text-xl font-bold text-content">{formatPrice(totalRevenue, locale)}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.bookings.stat.pending')}</p>
              <p className="text-xl font-bold text-content">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#7B61FF] light:text-violet-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.bookings.stat.completed')}</p>
              <p className="text-xl font-bold text-content">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.bookings.search')}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        dateRange={{
          from: filters.dateFrom ?? null,
          to: filters.dateTo ?? null,
          onChange: handleDateRangeChange,
        }}
        filters={[
          {
            key: "status",
            label: t('admin.bookings.filter.status'),
            // Derived from BOOKING_STATUS_META so this list cannot drift from the enum
            // again — as plain strings it silently survived the vocabulary migration and
            // every option matched zero bookings.
            options: [
              { value: "all", label: t('admin.bookings.filter.allStatus') },
              ...(Object.keys(BOOKING_STATUS_META) as BookingStatus[]).map((s) => ({
                value: s,
                label: t(BOOKING_STATUS_META[s].labelKey),
              })),
              { value: BOOKING_DISPUTED_FILTER, label: t('admin.bookings.filter.disputes' as MessageKey) },
            ],
            value: filters.status || "all",
            onChange: handleStatusChange,
          },
        ]}
        onClearFilters={handleClearFilters}
      />

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-200 light:text-red-700 font-medium">{t('admin.table.loadError')}</p>
          <p className="text-red-300/70 light:text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={bookings}
        columns={columns}
        keyExtractor={(booking) => booking.id}
        isLoading={isLoadingBookings}
        onRowClick={(booking) => router.push(`/admin/bookings/?id=${booking.id}`)}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: bookingsTotal,
          pageSize: filters.limit || 20,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
        }}
        emptyMessage={t('admin.bookings.empty')}
      />
    </div>
  );
}
