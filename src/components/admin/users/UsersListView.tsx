"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import {
  DataTable,
  FilterBar,
  UserRoleBadge,
  StatusBadge,
  SuperadminOnly,
  ConfirmDeleteDialog,
  recordAudit,
} from "@/components/admin";
import { UserRoleSelect } from "./UserRoleSelect";
import { UserRowQuickActions } from "./UserRowQuickActions";
import { BulkDeleteJobBanner } from "./BulkDeleteJobBanner";
import { Button } from "@/components/ui/button";
import { AdminUser, UserFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatDate, toDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  DEFAULT_USER_FILTERS,
  USERS_LIST_QUERY_KEY,
  filtersFromParams,
  queryFromFilters,
} from "@/lib/admin/usersListQuery";
import {
  startBulkDelete,
  watchBulkDeleteJob,
  findRunningBulkDelete,
  type BulkDeleteJobView,
} from "@/lib/firebase/bulkDelete";
import {
  User,
  UserPlus,
  Trash2,
  Ban,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";

const DEMO_EMAIL_DOMAIN = "@demo.vfit";

/**
 * Which extra status badge a hidden (soft-deleted or seeded demo) account gets in the
 * users table — distinct from `isHiddenAccount` in lib/firebase/admin.ts, which only needs
 * to decide whether an account is hidden at all, not which kind it is.
 */
function hiddenAccountKind(user: AdminUser): "deleted" | "demo" | null {
  const raw = user as unknown as { isDeleted?: boolean; deletedAt?: unknown };
  if (raw.isDeleted === true || raw.deletedAt) return "deleted";
  const email = typeof user.email === "string" ? user.email.toLowerCase() : "";
  if (email.endsWith(DEMO_EMAIL_DOMAIN) || user.id.startsWith("provider_") || user.id.startsWith("customer_")) {
    return "demo";
  }
  return null;
}

export function UsersListView() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    users,
    usersTotal,
    isLoadingUsers,
    error,
    fetchUsers,
    bulkUpdateUsersAction,
    bulkUpdateUserRoleAction,
    exportDataAction,
    clearError,
  } = useAdminStore();
  const authUser = useAuthStore((s) => s.user);

  const searchParams = useSearchParams();
  // Seeded from the URL so a reload, or coming back from a user's page, keeps the filters.
  const [filters, setFilters] = useState<UserFilters>(() => filtersFromParams(searchParams));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BulkDeleteJobView | null>(null);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  // The id of the job whose watch last failed — compared against the current jobId rather
  // than reset explicitly, so starting or picking up a different job clears it for free.
  const [jobWatchErrorId, setJobWatchErrorId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers(filters);
  }, [filters, fetchUsers]);

  // A reload mid-job brings the banner back. `prev ?? id` so this never clobbers a job the
  // admin has already started in this tab while the lookup was in flight.
  useEffect(() => {
    if (!authUser?.id || authUser.role !== 'superadmin') return;
    let cancelled = false;
    findRunningBulkDelete(authUser.id)
      .then((id) => { if (!cancelled && id) setJobId((prev) => prev ?? id); })
      .catch((err) => console.error('Could not look up running bulk delete:', err));
    return () => { cancelled = true; };
  }, [authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!jobId) return;
    // The job keeps running server-side even if the listener itself fails (permissions,
    // offline) — record which job that was rather than treating the job as stopped.
    return watchBulkDeleteJob(jobId, setJob, () => setJobWatchErrorId(jobId));
  }, [jobId]);

  // Refresh the list once, when the job finishes (including the terminal 'failed' status).
  const jobFinished =
    job?.status === 'completed' || job?.status === 'completed_with_errors' || job?.status === 'failed';
  useEffect(() => {
    if (jobFinished) fetchUsers(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobFinished]);

  // replaceState rather than router.replace: Next syncs useSearchParams from it without a
  // navigation, so typing in the search box does not trigger one per keystroke.
  useEffect(() => {
    const query = queryFromFilters(filters);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    try {
      sessionStorage.setItem(USERS_LIST_QUERY_KEY, query);
    } catch {
      // Storage unavailable: the URL still carries the filters.
    }
  }, [filters]);

  // Clear error when unmounting
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // Selection is cleared on every filter/search/page change: it otherwise survives across
  // them, so a hard delete could reach users that were never on screen (e.g. tick 2 under
  // "Tutti", switch to "Demo & eliminati", tick 5 more → 7 deleted).
  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
    setSelectedIds([]);
  };

  const handleRoleChange = (role: string) => {
    setFilters((prev) => ({ ...prev, role: role as UserFilters["role"], page: 1 }));
    setSelectedIds([]);
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as UserFilters["status"], page: 1 }));
    setSelectedIds([]);
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    setSelectedIds([]);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_USER_FILTERS);
    setSelectedIds([]);
  };

  const handleExport = async () => {
    try {
      const url = await exportDataAction("users", {
        format: "csv",
        filters,
      });
      window.open(url, "_blank");
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleBulkAction = async (action: "activate" | "suspend") => {
    if (selectedIds.length === 0) return;

    const confirmed = confirm(
      t('admin.users.bulkConfirm', { action, count: String(selectedIds.length) })
    );
    if (!confirmed) return;

    try {
      await bulkUpdateUsersAction(selectedIds, action);
      setSelectedIds([]);
    } catch (error) {
      console.error(`Bulk ${action} failed:`, error);
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: t('admin.users.col.user'),
      cell: (user) => (
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.fullName}
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
            <p className="font-medium text-content">{user.fullName}</p>
            <p className="text-sm text-content-muted">{user.email || user.phone}</p>
          </div>
        </div>
      ),
      width: "w-1/4",
    },
    {
      key: "role",
      header: t('admin.users.col.role'),
      cell: (user) => <UserRoleBadge role={user.role} size="sm" />,
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: t('admin.users.col.status'),
      cell: (user) => {
        const hidden = hiddenAccountKind(user);
        return (
          <StatusBadge
            status={hidden ?? (user.isSuspended ? "suspended" : "active")}
            size="sm"
          />
        );
      },
      sortable: true,
      width: "w-24",
    },
    {
      key: "joined",
      header: t('admin.users.col.joined'),
      cell: (user) => {
        const date = toDate(user.createdAt);
        return (
          <span className="text-sm text-content-muted">
            {date ? formatDate(date) : "N/A"}
          </span>
        );
      },
      sortable: true,
      width: "w-32",
    },
    {
      key: "lastLogin",
      header: t('admin.users.col.lastLogin'),
      cell: (user) => {
        const date = toDate(user.lastLoginAt);
        return (
          <span className="text-sm text-content-muted">
            {date
              ? formatDate(date, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : t('admin.users.col.never')}
          </span>
        );
      },
      sortable: true,
      width: "w-32",
    },
    {
      key: "actions",
      header: " ",
      cell: (user) => (
        <UserRowQuickActions
          user={user}
          onDone={() => fetchUsers(filters)}
        />
      ),
      width: "w-12",
    },
  ];

  const totalPages = Math.ceil(usersTotal / (filters.limit || 20));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.users.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.users.subtitle')}
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => router.push('/admin/users/?id=new')}
        >
          <UserPlus className="w-4 h-4" />
          {t('admin.users.addUser')}
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-medium">{t('admin.users.error.loading')}</p>
              <p className="text-red-300/70 text-sm">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearError}
            aria-label={t('common.close')}
            className="touch-target flex items-center justify-center text-red-300/70 hover:text-red-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {bulkDeleteError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-medium">{t('admin.users.bulkDeleteJob.startError')}</p>
              <p className="text-red-300/70 text-sm">{bulkDeleteError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBulkDeleteError(null)}
            aria-label={t('common.close')}
            className="touch-target flex items-center justify-center text-red-300/70 hover:text-red-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        searchPlaceholder={t('admin.users.search')}
        searchValue={filters.search || ""}
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "role",
            label: t('admin.users.filter.role'),
            options: [
              { value: "all", label: t('admin.users.filter.allRoles') },
              { value: "superadmin", label: "Superadmin" },
              { value: "admin", label: "Admin" },
              { value: "provider", label: "Provider" },
              { value: "customer", label: "Customer" },
            ],
            value: filters.role || "all",
            onChange: handleRoleChange,
          },
          {
            key: "status",
            label: t('admin.users.filter.status'),
            options: [
              { value: "all", label: t('admin.users.filter.allStatus') },
              { value: "active", label: t('admin.users.filter.active') },
              { value: "suspended", label: t('admin.users.filter.suspended') },
              { value: "hidden", label: t('admin.users.filter.hidden') },
            ],
            value: filters.status || "all",
            onChange: handleStatusChange,
          },
        ]}
        onExport={handleExport}
        onClearFilters={handleClearFilters}
      />

      {job && (
        <BulkDeleteJobBanner
          job={job}
          onDismiss={() => { setJob(null); setJobId(null); }}
        />
      )}

      {jobId && jobWatchErrorId === jobId && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-200 font-medium">{t('admin.users.bulkDeleteJob.watchError')}</p>
          </div>
          <button
            type="button"
            onClick={() => setJobWatchErrorId(null)}
            aria-label={t('common.close')}
            className="touch-target flex items-center justify-center text-red-300/70 hover:text-red-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-[#00C9FF]/10 border border-[#00C9FF]/30 rounded-xl">
          <span className="text-sm text-content">
            {t('admin.users.selected', { count: String(selectedIds.length) })}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBulkAction("activate")}
            className="text-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/10"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            {t('admin.users.bulkActivate')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBulkAction("suspend")}
            className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
          >
            <Ban className="w-4 h-4 mr-1" />
            {t('admin.users.bulkSuspend')}
          </Button>
          <SuperadminOnly>
            <UserRoleSelect
              onChange={async (role) => {
                const ok = window.confirm(
                  t('admin.users.bulkRoleConfirm', {
                    role,
                    count: String(selectedIds.length),
                  })
                );
                if (!ok) return;
                const ids = [...selectedIds];
                try {
                  await bulkUpdateUserRoleAction(ids, role);
                  // Write one audit log per affected user
                  ids.forEach((id) => {
                    void recordAudit(authUser, {
                      action: 'role_change',
                      entityType: 'user',
                      entityId: id,
                      after: { role },
                    });
                  });
                  setSelectedIds([]);
                } catch (err) {
                  console.error('Bulk role change failed:', err);
                }
              }}
              className="rounded-lg border border-white/20 bg-surface-2 px-3 py-1.5 text-sm text-content"
            />
          </SuperadminOnly>
          <SuperadminOnly>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t('admin.users.bulkDelete')}
            </Button>
          </SuperadminOnly>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={users}
        columns={columns}
        keyExtractor={(user) => user.id}
        onRowClick={(user) => router.push(`/admin/users/?id=${user.id}`)}
        isLoading={isLoadingUsers}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        pagination={{
          currentPage: filters.page || 1,
          totalPages,
          totalItems: usersTotal,
          pageSize: filters.limit || 20,
          onPageChange: handlePageChange,
        }}
        emptyMessage={t('admin.users.empty')}
      />

      <ConfirmDeleteDialog
        open={confirmBulkDelete}
        entityLabel={t('admin.users.bulkDeleteEntity')}
        entityName={String(selectedIds.length)}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async (reason) => {
          // ConfirmDeleteDialog has no catch of its own: a throw here would be an unhandled
          // rejection with no message on screen. Report it in the page instead.
          try {
            const id = await startBulkDelete([...selectedIds], reason);
            setSelectedIds([]);
            // Clear the previous job's view before pointing at the new id, so the
            // refresh-on-finish effect and the dismiss button never act on stale state.
            setJob(null);
            setJobId(id);
            setBulkDeleteError(null);
          } catch (err) {
            console.error('Bulk delete could not start:', err);
            const code = (err as { code?: string } | null | undefined)?.code;
            setBulkDeleteError(
              code === 'functions/failed-precondition'
                ? t('admin.users.bulkDeleteJob.alreadyRunning')
                : err instanceof Error
                  ? err.message
                  : String(err)
            );
          }
        }}
      />
    </div>
  );
}
