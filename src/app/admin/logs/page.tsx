"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  DEFAULT_LOG_FILTERS,
  DEFAULT_LOGS_PAGE_SIZE,
  SYSTEM_LOG_ACTIONS,
  logFiltersFromParams,
  queryFromLogFilters,
} from "@/lib/admin/logsListQuery";
import { fromDateParam, toDateParam } from "@/lib/admin/usersListQuery";
import { useAdminStore } from "@/stores/adminStore";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/authStore";
import { DataTable, FilterBar } from "@/components/admin";
import { Column } from "@/components/admin/DataTable";
import { LogFilters, SystemLog } from "@/types/admin";
import { formatDate, toDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  Download,
  Shield,
} from "lucide-react";

export default function SystemLogsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { systemLogs, logsTotal, logsFilters, isLoadingLogs, error, fetchSystemLogs } = useAdminStore(
    useShallow((s) => ({
      systemLogs: s.systemLogs,
      logsTotal: s.logsTotal,
      logsFilters: s.logsFilters,
      isLoadingLogs: s.isLoadingLogs,
      error: s.error,
      fetchSystemLogs: s.fetchSystemLogs,
    }))
  );

  const searchParams = useSearchParams();
  // Seeded from the URL so a reload keeps the filters (same contract as the users list).
  const [filters, setFilters] = useState<LogFilters>(() => logFiltersFromParams(searchParams));
  // What the search box shows; it reaches `filters` (the fetch and the URL) once typing pauses.
  const [searchInput, setSearchInput] = useState(() => filters.search ?? "");
  const applySearch = useDebouncedCallback((search: string) =>
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  );

  const isSuperadmin = user?.role === "superadmin";
  useEffect(() => {
    if (!isSuperadmin) {
      router.push("/admin");
      return;
    }
    fetchSystemLogs(filters);
  }, [isSuperadmin, router, fetchSystemLogs, filters]);

  useEffect(() => {
    // Not while the redirect above is in flight: a replaceState now would undo it.
    if (!isSuperadmin) return;
    const query = queryFromLogFilters(filters);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters, isSuperadmin]);

  const handleSearchChange = (search: string) => {
    setSearchInput(search);
    if (search) {
      applySearch.run(search);
    } else {
      applySearch.cancel();
      setFilters((prev) => (prev.search ? { ...prev, search: "", page: 1 } : prev));
    }
  };

  const handleSeverityChange = (severity: string) => {
    setFilters((prev) => ({ ...prev, severity: severity as LogFilters["severity"], page: 1 }));
  };

  const handleActionChange = (action: string) => {
    setFilters((prev) => ({ ...prev, action, page: 1 }));
  };

  // FilterBar hands back local-midnight dates; the "to" day is included up to its last moment.
  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    setFilters((prev) => {
      const next: LogFilters = { ...prev, page: 1 };
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
    setFilters(DEFAULT_LOG_FILTERS);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-[#EF4444] light:text-red-700" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-[#F59E0B] light:text-amber-700" />;
      default:
        return <Info className="w-4 h-4 text-[#00C9FF] light:text-cyan-700" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "bg-[#EF4444]/10 text-[#EF4444] light:text-red-700 border-[#EF4444]/30";
      case "warning":
        return "bg-[#F59E0B]/10 text-[#F59E0B] light:text-amber-700 border-[#F59E0B]/30";
      default:
        return "bg-[#00C9FF]/10 text-[#00C9FF] light:text-cyan-700 border-[#00C9FF]/30";
    }
  };

  const columns: Column<SystemLog>[] = [
    {
      key: "timestamp",
      header: t('admin.logs.col.timestamp'),
      cell: (log) => {
        const date = toDate(log.timestamp);
        return (
          <span className="text-sm text-content-muted whitespace-nowrap">
            {formatDate(date || new Date(), locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        );
      },
      sortable: true,
      width: "w-40",
    },
    {
      key: "severity",
      header: t('admin.logs.col.severity'),
      cell: (log) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getSeverityColor(
            log.severity
          )}`}
        >
          {getSeverityIcon(log.severity)}
          {log.severity.charAt(0).toUpperCase() + log.severity.slice(1)}
        </span>
      ),
      sortable: true,
      width: "w-28",
    },
    {
      key: "action",
      header: t('admin.logs.col.action'),
      cell: (log) => (
        <span className="font-medium text-content text-sm">{log.action}</span>
      ),
      width: "w-40",
    },
    {
      key: "user",
      header: t('admin.logs.col.user'),
      cell: (log) => (
        <div>
          {log.userName ? (
            <>
              <p className="text-sm text-content">{log.userName}</p>
              <p className="text-xs text-content-muted">{log.userRole}</p>
            </>
          ) : log.by ? (
            // logAdminAction stores only the actor's uid — the value the search box filters on.
            <span className="text-xs text-content-muted font-mono break-all">{log.by}</span>
          ) : (
            <span className="text-sm text-content-faint">{t('admin.logs.col.system')}</span>
          )}
        </div>
      ),
      width: "w-32",
    },
    {
      key: "details",
      header: t('admin.logs.col.details'),
      cell: (log) => (
        <p className="text-sm text-content-muted truncate max-w-md">{log.details}</p>
      ),
    },
    {
      key: "ip",
      header: t('admin.logs.col.ipAddress'),
      cell: (log) => (
        <span className="text-sm text-content-faint font-mono">{log.ipAddress || "-"}</span>
      ),
      width: "w-32",
    },
  ];

  const pageSize = filters.limit || DEFAULT_LOGS_PAGE_SIZE;
  const totalPages = Math.ceil(logsTotal / pageSize);

  // A `?page=N` past the end steps back to the last page once this query's total is in —
  // same render-time adjustment as UsersListView.
  if (logsFilters === filters && !isLoadingLogs && logsTotal > 0 && (filters.page || 1) > totalPages) {
    setFilters({ ...filters, page: totalPages });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.logs.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.logs.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl">
            <Shield className="w-4 h-4 text-[#FFD700] light:text-yellow-700" />
            <span className="text-sm text-[#FFD700] light:text-yellow-700">{t('admin.logs.superadminOnly')}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.logs.search')}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        dateRange={{
          from: filters.dateFrom ?? null,
          to: filters.dateTo ?? null,
          onChange: handleDateRangeChange,
        }}
        filters={[
          {
            key: "severity",
            label: t('admin.logs.filter.severity'),
            options: [
              { value: "all", label: t('admin.logs.filter.allSeverities') },
              { value: "info", label: t('admin.logs.filter.info') },
              { value: "warning", label: t('admin.logs.filter.warning') },
              { value: "error", label: t('admin.logs.filter.error') },
            ],
            value: filters.severity || "all",
            onChange: handleSeverityChange,
          },
          {
            key: "action",
            label: t('admin.logs.filter.action'),
            options: [
              { value: "all", label: t('admin.logs.filter.allActions') },
              ...SYSTEM_LOG_ACTIONS.map((action) => ({ value: action, label: action })),
            ],
            value: filters.action || "all",
            onChange: handleActionChange,
          },
        ]}
        onExport={() => console.log("Export logs")}
        onClearFilters={handleClearFilters}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.logs.stat.totalLogs')}</p>
              <p className="text-xl font-bold text-content">{logsTotal}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B] light:text-amber-700" />
            </div>
            <div>
              {/* Warnings/errors count the rows on this page, not the whole filtered log. */}
              <p className="text-xs text-content-faint">{t('admin.logs.stat.warnings')}</p>
              <p className="text-xl font-bold text-content">
                {systemLogs.filter((l) => l.severity === "warning").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#EF4444] light:text-red-700" />
            </div>
            <div>
              <p className="text-xs text-content-faint">{t('admin.logs.stat.errors')}</p>
              <p className="text-xl font-bold text-content">
                {systemLogs.filter((l) => l.severity === "error").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-200 light:text-red-700 font-medium">{t('admin.table.loadError')}</p>
          <p className="text-red-300/70 light:text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={systemLogs}
        columns={columns}
        keyExtractor={(log) => log.id}
        isLoading={isLoadingLogs}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: logsTotal,
          pageSize,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
        }}
        emptyMessage={t('admin.logs.empty')}
      />
    </div>
  );
}
