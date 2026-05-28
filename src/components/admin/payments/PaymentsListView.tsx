"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, FilterBar, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/admin/DataTable";
import { formatPrice, formatDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  CreditCard,
  Download,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
} from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { Spinner } from "@/components/ui/Spinner";

// Local shape: createdAt as Date for formatDate compatibility
interface TransactionRow {
  id: string;
  type: "booking_payment" | "payout" | "refund" | "commission";
  amount: number;
  status: "completed" | "pending" | "failed";
  description: string;
  customerName: string;
  providerName: string;
  createdAt: Date;
}

export function PaymentsListView() {
  const { t } = useI18n();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: rawTransactions = [], isLoading } = useTransactions({ limit: 50 });

  // Map Timestamp → Date for formatDate
  const transactions: TransactionRow[] = rawTransactions.map((tx) => ({
    ...tx,
    createdAt: tx.createdAt?.toDate?.() ?? new Date(),
  }));

  const columns: Column<TransactionRow>[] = [
    {
      key: "transactionId",
      header: t('admin.payments.col.transactionId'),
      cell: (tx) => (
        <div>
          <p className="font-medium text-white">{tx.id.toUpperCase()}</p>
          <p className="text-xs text-white/40">
            {formatDate(tx.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      ),
      width: "w-32",
    },
    {
      key: "type",
      header: t('admin.payments.col.type'),
      cell: (tx) => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            tx.type === "booking_payment"
              ? "bg-[#10B981]/20 text-[#10B981]"
              : tx.type === "payout"
              ? "bg-[#00C9FF]/20 text-[#00C9FF]"
              : tx.type === "refund"
              ? "bg-[#EF4444]/20 text-[#EF4444]"
              : "bg-[#F59E0B]/20 text-[#F59E0B]"
          }`}
        >
          {tx.type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
        </span>
      ),
      width: "w-28",
    },
    {
      key: "description",
      header: t('admin.payments.col.description'),
      cell: (tx) => (
        <div>
          <p className="text-sm text-white">{tx.description}</p>
          <p className="text-xs text-white/50">
            {tx.customerName !== "-" && `${t('admin.payments.col.customerPrefix')} ${tx.customerName} · `}
            {t('admin.payments.col.providerPrefix')} {tx.providerName}
          </p>
        </div>
      ),
      width: "w-1/3",
    },
    {
      key: "amount",
      header: t('admin.payments.col.amount'),
      cell: (tx) => (
        <span
          className={`font-medium ${
            tx.type === "booking_payment" || tx.type === "commission"
              ? "text-[#10B981]"
              : tx.type === "refund"
              ? "text-[#EF4444]"
              : "text-white"
          }`}
        >
          {tx.type === "booking_payment" || tx.type === "commission" ? "+" : "-"}
          {formatPrice(tx.amount)}
        </span>
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "status",
      header: t('admin.payments.col.status'),
      cell: (tx) => <StatusBadge status={tx.status} size="sm" />,
      sortable: true,
      width: "w-24",
    },
  ];

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchValue.toLowerCase()) ||
      tx.providerName.toLowerCase().includes(searchValue.toLowerCase()) ||
      tx.customerName.toLowerCase().includes(searchValue.toLowerCase());
    const matchesStatus = statusFilter === "all" ? true : tx.status === statusFilter;
    const matchesType = typeFilter === "all" ? true : tx.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Calculate stats
  const totalRevenue = transactions
    .filter((tx) => tx.type === "booking_payment" && tx.status === "completed")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalPayouts = transactions
    .filter((tx) => tx.type === "payout" && tx.status === "completed")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalCommissions = transactions
    .filter((tx) => tx.type === "commission" && tx.status === "completed")
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.payments.title')}</h1>
          <p className="text-white/50 mt-1">{t('admin.payments.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push("/admin/payments/reports")}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {t('admin.payments.reports')}
          </Button>
          <Button variant="primary" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            {t('admin.payments.export')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.payments.stat.totalRevenue')}</p>
              <p className="text-xl font-bold text-white">{formatPrice(totalRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.payments.stat.totalPayouts')}</p>
              <p className="text-xl font-bold text-white">{formatPrice(totalPayouts)}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.payments.stat.commission')}</p>
              <p className="text-xl font-bold text-white">{formatPrice(totalCommissions)}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">{t('admin.payments.stat.thisMonth')}</p>
              <p className="text-xl font-bold text-white">{formatPrice(totalRevenue * 0.3)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.payments.search')}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: "type",
            label: t('admin.payments.filter.type'),
            options: [
              { value: "all", label: t('admin.payments.filter.allTypes') },
              { value: "booking_payment", label: t('admin.payments.filter.bookingPayment') },
              { value: "payout", label: t('admin.payments.filter.payout') },
              { value: "refund", label: t('admin.payments.filter.refund') },
              { value: "commission", label: t('admin.payments.filter.commission') },
            ],
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            key: "status",
            label: t('admin.payments.filter.status'),
            options: [
              { value: "all", label: t('admin.payments.filter.allStatus') },
              { value: "completed", label: t('admin.payments.filter.completed') },
              { value: "pending", label: t('admin.payments.filter.pending') },
              { value: "failed", label: t('admin.payments.filter.failed') },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        onClearFilters={() => {
          setSearchValue("");
          setStatusFilter("all");
          setTypeFilter("all");
        }}
      />

      {/* Data Table */}
      {isLoading && <Spinner size="md" />}
      <DataTable
        data={filteredTransactions}
        columns={columns}
        keyExtractor={(tx) => tx.id}
        onRowClick={(tx) => router.push(`/admin/payments/?id=${tx.id}`)}
        emptyMessage={t('admin.payments.empty')}
      />
    </div>
  );
}
