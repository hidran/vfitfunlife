"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { DataTable, FilterBar, UserRoleBadge, StatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { AdminUser, UserFilters } from "@/types/admin";
import { Column } from "@/components/admin/DataTable";
import { formatDate, toDate } from "@/lib/utils";
import {
  User,
  Mail,
  Phone,
  MoreHorizontal,
  Download,
  UserPlus,
  Trash2,
  Ban,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";

export default function UsersPage() {
  const router = useRouter();
  const {
    users,
    usersTotal,
    isLoadingUsers,
    error,
    fetchUsers,
    bulkUpdateUsersAction,
    exportDataAction,
    suspendUserAction,
    activateUserAction,
    clearError,
  } = useAdminStore();

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
    setFilters((prev) => ({ ...prev, role: role as any, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status: status as any, page: 1 }));
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
      `Are you sure you want to ${action} ${selectedIds.length} user(s)?`
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
      header: "User",
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
      header: "Role",
      cell: (user) => <UserRoleBadge role={user.role} size="sm" />,
      sortable: true,
      width: "w-24",
    },
    {
      key: "status",
      header: "Status",
      cell: (user) => (
        <StatusBadge status={user.isSuspended ? "suspended" : "active"} size="sm" />
      ),
      sortable: true,
      width: "w-24",
    },
    {
      key: "joined",
      header: "Joined",
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
      header: "Last Login",
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
              : "Never"}
          </span>
        );
      },
      sortable: true,
      width: "w-32",
    },
  ];

  const totalPages = Math.ceil(usersTotal / (filters.limit || 20));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-white/50 mt-1">
            Manage user accounts and permissions
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {/* TODO: Add user modal */}}
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-medium">Error loading users</p>
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
        searchPlaceholder="Search users by name, email, or phone..."
        searchValue={filters.search || ""}
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "role",
            label: "Role",
            options: [
              { value: "all", label: "All Roles" },
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
        onExport={handleExport}
        onClearFilters={handleClearFilters}
      />

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#00C9FF]/10 border border-[#00C9FF]/30 rounded-xl">
          <span className="text-sm text-white">
            {selectedIds.length} user(s) selected
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBulkAction("activate")}
            className="text-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/10"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Activate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBulkAction("suspend")}
            className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
          >
            <Ban className="w-4 h-4 mr-1" />
            Suspend
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleBulkAction("delete")}
            className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={users}
        columns={columns}
        keyExtractor={(user) => user.id}
        onRowClick={(user) => router.push(`/admin/users/${user.id}`)}
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
        emptyMessage="No users found"
      />
    </div>
  );
}
