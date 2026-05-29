"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import {
  DataTable,
  FilterBar,
  UserRoleBadge,
  StatusBadge,
  SuperadminOnly,
  recordAudit,
} from "@/components/admin";
import { UserRoleSelect } from "./UserRoleSelect";
import { UserRowQuickActions } from "./UserRowQuickActions";
import { Button } from "@/components/ui/button";
import { AdminUser, UserFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatDate, toDate } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  User,
  UserPlus,
  Trash2,
  Ban,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";

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

  const [filters, setFilters] = useState<UserFilters>({
    role: "all",
    status: "all",
    search: "",
    page: 1,
    limit: 20,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers(filters);
  }, [filters, fetchUsers]);

  // Clear error when unmounting
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  };

  const handleRoleChange = (role: string) => {
    setFilters((prev) => ({ ...prev, role: role as UserFilters["role"], page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as UserFilters["status"], page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleClearFilters = () => {
    setFilters({
      role: "all",
      status: "all",
      search: "",
      page: 1,
      limit: 20,
    });
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

  const handleBulkAction = async (action: "activate" | "suspend" | "delete") => {
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
              className="w-10 h-10 rounded-xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white font-semibold">
              <User className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="font-medium text-white">{user.fullName}</p>
            <p className="text-sm text-white/50">{user.email || user.phone}</p>
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
      cell: (user) => (
        <StatusBadge status={user.isSuspended ? "suspended" : "active"} size="sm" />
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "joined",
      header: t('admin.users.col.joined'),
      cell: (user) => {
        const date = toDate(user.createdAt);
        return (
          <span className="text-sm text-white/50">
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
          <span className="text-sm text-white/50">
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
          <h1 className="text-2xl font-bold text-white">{t('admin.users.title')}</h1>
          <p className="text-white/50 mt-1">
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-medium">{t('admin.users.error.loading')}</p>
              <p className="text-red-300/70 text-sm">{error}</p>
            </div>
          </div>
          <button
            onClick={clearError}
            className="text-red-300/70 hover:text-red-200 transition-colors"
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
            ],
            value: filters.status || "all",
            onChange: handleStatusChange,
          },
        ]}
        onExport={handleExport}
        onClearFilters={handleClearFilters}
      />

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#00C9FF]/10 border border-[#00C9FF]/30 rounded-xl">
          <span className="text-sm text-white">
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
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white"
            />
          </SuperadminOnly>
          <SuperadminOnly>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkAction("delete")}
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
    </div>
  );
}
