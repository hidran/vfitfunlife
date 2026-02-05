"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { DataTable, UserRoleBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/admin/DataTable";
import { formatDate, toDate } from "@/lib/utils";
import { User, UserRole } from "@/types/firebase";
import {
  Shield,
  Plus,
  AlertTriangle,
  UserPlus,
  Trash2,
  Mail,
} from "lucide-react";

interface AdminUser extends User {
  addedBy?: string;
  addedAt?: Date;
}

export default function UserRolesPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Mock admin users data
  const adminUsers: AdminUser[] = [
    {
      id: "1",
      uid: "1",
      email: "super@example.com",
      phone: "+39 123 4567890",
      fullName: "Super Admin",
      avatarUrl: null,
      dateOfBirth: null,
      role: "superadmin",
      isVip: false,
      vipExpiresAt: null,
      vipPlanId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      pointsBalance: 0,
      walletBalance: 0,
      preferredLanguage: "it",
      preferredSection: "fit",
      notificationsEnabled: true,
      fcmTokens: [],
      referralCode: "",
      referredBy: null,
      referralCount: 0,
      bio: null,
      phoneVerified: true,
      emailVerified: true,
      socialLinks: null,
      providerProfile: null,
      notificationSettings: {
        email: true,
        push: true,
        sms: false,
        marketing: false,
        bookingReminders: true,
        promotions: false,
        newMessages: true,
      },
      privacySettings: {
        profileVisible: false,
        bookingsVisible: false,
        showEmail: false,
        showPhone: false,
      },
      createdAt: { toDate: () => new Date("2024-01-01") } as any,
      updatedAt: { toDate: () => new Date("2024-01-01") } as any,
      lastLoginAt: { toDate: () => new Date() } as any,
      addedBy: "System",
      addedAt: new Date("2024-01-01"),
    },
  ];

  const isSuperadmin = user?.role === "superadmin";

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => (
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              className="w-10 h-10 rounded-xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA500] flex items-center justify-center text-white font-semibold">
              <Shield className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="font-medium text-white">{user.fullName}</p>
            <p className="text-sm text-white/50">{user.email}</p>
          </div>
        </div>
      ),
      width: "w-1/3",
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => <UserRoleBadge role={user.role} size="md" />,
      width: "w-32",
    },
    {
      key: "added",
      header: "Added",
      cell: (user) => (
        <div>
          <p className="text-sm text-white/70">
            {(user as any).addedAt ? formatDate((user as any).addedAt) : "N/A"}
          </p>
          <p className="text-xs text-white/40">by {(user as any).addedBy || "System"}</p>
        </div>
      ),
      width: "w-40",
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
      width: "w-32",
    },
  ];

  if (!isSuperadmin) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertTriangle className="w-16 h-16 text-[#F59E0B] mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-white/50 text-center max-w-md">
          Only superadmin users can manage admin roles and permissions.
        </p>
        <Button
          variant="secondary"
          onClick={() => router.push("/admin/users")}
          className="mt-6"
        >
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Roles</h1>
          <p className="text-white/50 mt-1">
            Manage admin users and their permissions
          </p>
        </div>
        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {/* TODO: Add admin modal */}}
        >
          <UserPlus className="w-4 h-4" />
          Add Admin
        </Button>
      </div>

      {/* Superadmin Notice */}
      <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-[#FFD700] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#FFD700]">Superadmin Access Only</p>
          <p className="text-sm text-white/70">
            This page allows you to manage admin users. Superadmins have full access to all platform features, while admins have limited access (cannot manage other admins or system settings).
          </p>
        </div>
      </div>

      {/* Role Permissions Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#FFD700]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#FFD700]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Superadmin</h3>
              <p className="text-sm text-white/50">Full platform access</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Manage all users (including other admins)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Access system logs and settings
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Configure platform settings
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Manage financial reports
            </li>
          </ul>
        </div>

        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Admin</h3>
              <p className="text-sm text-white/50">Limited platform access</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Manage customers and providers
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              View and manage bookings
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Manage user types and venues
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              Cannot manage other admins
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              Cannot access system logs
            </li>
          </ul>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={adminUsers}
        columns={columns}
        keyExtractor={(user) => user.id}
        actions={{
          edit: (user) => console.log("Edit:", user.id),
          delete: (user) => {
            if (user.role === "superadmin") {
              alert("Cannot remove superadmin role from the primary superadmin.");
              return;
            }
            const confirmed = confirm(`Remove admin access for ${user.fullName}?`);
            if (confirmed) {
              console.log("Remove admin:", user.id);
            }
          },
        }}
        emptyMessage="No admin users found"
      />
    </div>
  );
}
