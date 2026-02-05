"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import { DataTable, FilterBar } from "@/components/admin";
import { Column } from "@/components/admin/DataTable";
import { LogFilters, SystemLog } from "@/types/admin";
import { formatDate, toDate } from "@/lib/utils";
import {
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  Download,
  Shield,
} from "lucide-react";

export default function SystemLogsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { systemLogs, logsTotal, isLoadingLogs, fetchSystemLogs } = useAdminStore();

  const [filters, setFilters] = useState<LogFilters>({
    severity: "all",
    search: "",
    page: 1,
    limit: 50,
  });

  useEffect(() => {
    if (user?.role !== "superadmin") {
      router.push("/admin");
      return;
    }
    fetchSystemLogs(filters);
  }, [user, router, fetchSystemLogs, filters]);

  const handleSeverityChange = (severity: string) => {
    setFilters((prev) => ({ ...prev, severity: severity as any, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleClearFilters = () => {
    setFilters({
      severity: "all",
      search: "",
      page: 1,
      limit: 50,
    });
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-[#EF4444]" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />;
      default:
        return <Info className="w-4 h-4 text-[#00C9FF]" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30";
      case "warning":
        return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30";
      default:
        return "bg-[#00C9FF]/10 text-[#00C9FF] border-[#00C9FF]/30";
    }
  };

  const columns: Column<SystemLog>[] = [
    {
      key: "timestamp",
      header: "Timestamp",
      cell: (log) => {
        const date = toDate(log.timestamp);
        return (
          <span className="text-sm text-white/50 whitespace-nowrap">
            {formatDate(date || new Date(), {
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
      header: "Severity",
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
      header: "Action",
      cell: (log) => (
        <span className="font-medium text-white text-sm">{log.action}</span>
      ),
      width: "w-40",
    },
    {
      key: "user",
      header: "User",
      cell: (log) => (
        <div>
          {log.userName ? (
            <>
              <p className="text-sm text-white">{log.userName}</p>
              <p className="text-xs text-white/50">{log.userRole}</p>
            </>
          ) : (
            <span className="text-sm text-white/40">System</span>
          )}
        </div>
      ),
      width: "w-32",
    },
    {
      key: "details",
      header: "Details",
      cell: (log) => (
        <p className="text-sm text-white/70 truncate max-w-md">{log.details}</p>
      ),
    },
    {
      key: "ip",
      header: "IP Address",
      cell: (log) => (
        <span className="text-sm text-white/40 font-mono">{log.ipAddress || "-"}</span>
      ),
      width: "w-32",
    },
  ];

  const totalPages = Math.ceil(logsTotal / (filters.limit || 50));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">System Logs</h1>
          <p className="text-white/50 mt-1">
            Audit trail of all admin actions and system events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl">
            <Shield className="w-4 h-4 text-[#FFD700]" />
            <span className="text-sm text-[#FFD700]">Superadmin Only</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        searchPlaceholder="Search logs by action or details..."
        searchValue={filters.search || ""}
        onSearchChange={(search) => setFilters((prev) => ({ ...prev, search, page: 1 }))}
        filters={[
          {
            key: "severity",
            label: "Severity",
            options: [
              { value: "all", label: "All Severities" },
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "error", label: "Error" },
            ],
            value: filters.severity || "all",
            onChange: handleSeverityChange,
          },
        ]}
        onExport={() => console.log("Export logs")}
        onClearFilters={handleClearFilters}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Total Logs</p>
              <p className="text-xl font-bold text-white">{logsTotal}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Warnings</p>
              <p className="text-xl font-bold text-white">
                {systemLogs.filter((l) => l.severity === "warning").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <div>
              <p className="text-xs text-white/40">Errors</p>
              <p className="text-xl font-bold text-white">
                {systemLogs.filter((l) => l.severity === "error").length}
              </p>
            </div>
          </div>
        </div>
      </div>

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
          pageSize: filters.limit || 50,
          onPageChange: handlePageChange,
        }}
        emptyMessage="No logs found"
      />
    </div>
  );
}
