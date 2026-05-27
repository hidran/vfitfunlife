"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/adminStore";
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

export default function BookingsPage() {
  const { t } = useI18n();
  const {
    bookings,
    bookingsTotal,
    isLoadingBookings,
    fetchBookings,
    cancelBookingAction,
    processRefundAction,
  } = useAdminStore();

  const [filters, setFilters] = useState<BookingFilters>({
    status: "all",
    search: "",
    page: 1,
    limit: 20,
  });

  useEffect(() => {
    fetchBookings(filters);
  }, [filters, fetchBookings]);

  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as any, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleClearFilters = () => {
    setFilters({
      status: "all",
      search: "",
      page: 1,
      limit: 20,
    });
  };

  const handleCancelBooking = async (booking: BookingType) => {
    const reason = prompt("Enter cancellation reason:");
    if (!reason) return;

    try {
      await cancelBookingAction(booking.id, reason);
    } catch (error) {
      console.error("Failed to cancel booking:", error);
    }
  };

  const handleRefund = async (booking: BookingType) => {
    const amount = prompt("Enter refund amount (€):");
    if (!amount) return;

    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      alert("Invalid amount");
      return;
    }

    try {
      await processRefundAction(booking.id, refundAmount);
    } catch (error) {
      console.error("Failed to process refund:", error);
    }
  };

  const columns: Column<BookingType>[] = [
    {
      key: "bookingId",
      header: t('admin.bookings.col.bookingId'),
      cell: (booking) => (
        <div>
          <p className="font-medium text-white">#{booking.id.slice(-6).toUpperCase()}</p>
          <p className="text-xs text-white/40">
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
            <p className="font-medium text-white text-sm">{booking.userName}</p>
            <p className="text-xs text-white/50">{booking.userPhone}</p>
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
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Store className="w-4 h-4 text-white/60" />
          </div>
          <div>
            <p className="font-medium text-white text-sm">{booking.instructorName}</p>
            <p className="text-xs text-white/50">{booking.venueName}</p>
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
          <p className="text-sm text-white">{booking.serviceName}</p>
          <p className="text-xs text-white/50">
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
        <span className="font-medium text-white">
          {formatPrice(booking.finalPrice || 0)}
        </span>
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: t('admin.bookings.col.status'),
      cell: (booking) => <StatusBadge status={booking.status as any} size="sm" />,
      sortable: true,
      width: "w-28",
    },
    {
      key: "payment",
      header: t('admin.bookings.col.payment'),
      cell: (booking) => (
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/70 capitalize">{booking.paymentStatus}</span>
        </div>
      ),
      width: "w-28",
    },
  ];

  const totalPages = Math.ceil(bookingsTotal / (filters.limit || 20));

  // Calculate stats
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.finalPrice || 0), 0);
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const completedCount = bookings.filter((b) => b.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.bookings.title')}</h1>
          <p className="text-white/50 mt-1">{t('admin.bookings.subtitle')}</p>
        </div>
        <Button variant="secondary" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          {t('admin.bookings.export')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.bookings.stat.totalBookings')}</p>
              <p className="text-xl font-bold text-white">{bookingsTotal}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.bookings.stat.totalRevenue')}</p>
              <p className="text-xl font-bold text-white">{formatPrice(totalRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.bookings.stat.pending')}</p>
              <p className="text-xl font-bold text-white">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.bookings.stat.completed')}</p>
              <p className="text-xl font-bold text-white">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.bookings.search')}
        searchValue={filters.search || ""}
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: t('admin.bookings.filter.status'),
            options: [
              { value: "all", label: t('admin.bookings.filter.allStatus') },
              { value: "pending", label: t('admin.bookings.filter.pending') },
              { value: "confirmed", label: t('admin.bookings.filter.confirmed') },
              { value: "in_progress", label: t('admin.bookings.filter.inProgress') },
              { value: "completed", label: t('admin.bookings.filter.completed') },
              { value: "cancelled", label: t('admin.bookings.filter.cancelled') },
            ],
            value: filters.status || "all",
            onChange: handleStatusChange,
          },
        ]}
        onClearFilters={handleClearFilters}
      />

      {/* Data Table */}
      <DataTable
        data={bookings}
        columns={columns}
        keyExtractor={(booking) => booking.id}
        isLoading={isLoadingBookings}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: bookingsTotal,
          pageSize: filters.limit || 20,
          onPageChange: handlePageChange,
        }}
        actions={{
          view: (booking) => {
            console.log("View booking:", booking.id);
          },
          delete: (booking) => {
            if (booking.status !== "cancelled") {
              handleCancelBooking(booking);
            }
          },
        }}
        emptyMessage={t('admin.bookings.empty')}
      />
    </div>
  );
}
