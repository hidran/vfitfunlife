"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { Button } from "@/components/ui/button";
import { UserRoleBadge, StatusBadge } from "@/components/admin";
import { formatDate, formatPrice, toDate } from "@/lib/utils";
import { User, UserRole } from "@/types/firebase";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Clock,
  Edit,
  Lock,
  Trash2,
  Ban,
  CheckCircle,
  UserCog,
  History,
  CreditCard,
  CalendarDays,
} from "lucide-react";

interface UserDetailClientProps {
  userId: string;
}

export default function UserDetailClient({ userId }: UserDetailClientProps) {
  const router = useRouter();
  const { users, fetchUsers, updateUserRoleAction, suspendUserAction, activateUserAction } = useAdminStore();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "bookings" | "activity">("overview");

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) return;
      if (users.length === 0) {
        await fetchUsers({});
      }
      const foundUser = users.find((u) => u.id === userId);
      if (foundUser) {
        setUser(foundUser);
      }
      setIsLoading(false);
    };
    loadUser();
  }, [userId, users, fetchUsers]);

  const handleRoleChange = async (newRole: UserRole) => {
    if (!user) return;
    try {
      await updateUserRoleAction(user.id, newRole);
      setUser({ ...user, role: newRole });
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    const reason = prompt("Enter suspension reason:");
    if (!reason) return;

    try {
      await suspendUserAction(user.id, reason);
      setUser({ ...user, isSuspended: true } as User);
    } catch (error) {
      console.error("Failed to suspend user:", error);
    }
  };

  const handleActivate = async () => {
    if (!user) return;
    try {
      await activateUserAction(user.id);
      setUser({ ...user, isSuspended: false } as User);
    } catch (error) {
      console.error("Failed to activate user:", error);
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    const confirmed = confirm(`Send password reset email to ${user.email}?`);
    if (!confirmed) return;
    alert("Password reset email sent!");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = confirm(
      `Are you sure you want to delete ${user.fullName}'s account? This action cannot be undone.`
    );
    if (!confirmed) return;
    router.push("/admin/users");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-3 border-white/20 border-t-[#00C9FF] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">User not found</p>
        <Button variant="secondary" onClick={() => router.push("/admin/users")} className="mt-4">
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push("/admin/users")} className="text-white/60">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Users
      </Button>

      {/* Profile Header */}
      <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.fullName}
                width={96}
                height={96}
                unoptimized
                className="w-24 h-24 rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#00C9FF] to-[#7B61FF] flex items-center justify-center text-white text-3xl font-semibold">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{user.fullName}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <UserRoleBadge role={user.role} />
                  <StatusBadge status={(user as any).isSuspended ? "suspended" : "active"} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResetPassword}
                  className="flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Reset Password
                </Button>
                {(user as any).isSuspended ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleActivate}
                    className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669]"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Activate
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSuspend}
                    className="flex items-center gap-2 text-[#F59E0B] hover:text-[#F59E0B]"
                  >
                    <Ban className="w-4 h-4" />
                    Suspend
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDeleteAccount}
                  className="flex items-center gap-2 text-[#EF4444] hover:text-[#EF4444]"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Email</p>
                  <p className="text-sm text-white truncate">{user.email || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Phone</p>
                  <p className="text-sm text-white">{user.phone || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Joined</p>
                  <p className="text-sm text-white">
                    {formatDate(toDate(user.createdAt) || new Date())}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Last Login</p>
                  <p className="text-sm text-white">
                    {user.lastLoginAt
                      ? formatDate(toDate(user.lastLoginAt) || new Date(), {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex gap-6">
          {[
            { id: "overview", label: "Overview", icon: UserCog },
            { id: "bookings", label: "Bookings", icon: CalendarDays },
            { id: "activity", label: "Activity Log", icon: History },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "text-[#00C9FF] border-[#00C9FF]"
                  : "text-white/50 border-transparent hover:text-white"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Account Info */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Account Information</h3>
                <Button variant="ghost" size="sm" className="text-[#00C9FF]">
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/50">Full Name</span>
                  <span className="text-white">{user.fullName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/50">Email</span>
                  <span className="text-white">{user.email || "Not set"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/50">Phone</span>
                  <span className="text-white">{user.phone || "Not set"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/50">Date of Birth</span>
                  <span className="text-white">
                    {user.dateOfBirth
                      ? formatDate(toDate(user.dateOfBirth) || new Date())
                      : "Not set"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/50">Role</span>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="bg-[#2A2D3A] border border-white/10 rounded-lg px-3 py-1 text-sm text-white"
                  >
                    <option value="customer">Customer</option>
                    <option value="provider">Provider</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <CalendarDays className="w-5 h-5 text-[#00C9FF]" />
                    <span className="text-white/50">Total Bookings</span>
                  </div>
                  <p className="text-2xl font-bold text-white">0</p>
                </div>
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <CreditCard className="w-5 h-5 text-[#10B981]" />
                    <span className="text-white/50">Total Spent</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatPrice(0)}</p>
                </div>
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] flex items-center justify-center text-[10px] font-bold text-black">
                      VIP
                    </div>
                    <span className="text-white/50">VIP Status</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {user.isVip ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-[#F59E0B]" />
                    <span className="text-white/50">Points</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{(user.pointsBalance || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Wallet & Points */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Wallet & Points</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                  <span className="text-white/50">Wallet Balance</span>
                  <span className="text-xl font-semibold text-white">
                    {formatPrice(user.walletBalance || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/20 rounded-xl">
                  <span className="text-white/50">Points Balance</span>
                  <span className="text-xl font-semibold text-white">
                    {(user.pointsBalance || 0).toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Notification Settings</h3>
              <div className="space-y-3">
                {[
                  { label: "Email Notifications", enabled: user.emailVerified },
                  { label: "Push Notifications", enabled: user.notificationsEnabled },
                  { label: "SMS Notifications", enabled: user.phoneVerified },
                  { label: "Marketing Emails", enabled: (user as any).notificationSettings?.marketing },
                ].map((setting) => (
                  <div key={setting.label} className="flex justify-between items-center">
                    <span className="text-white/70">{setting.label}</span>
                    <span
                      className={`text-sm ${
                        setting.enabled ? "text-[#10B981]" : "text-white/40"
                      }`}
                    >
                      {setting.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-8 text-center">
            <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">Booking history will be displayed here</p>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-8 text-center">
            <History className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">Activity log will be displayed here</p>
          </div>
        )}
      </div>
    </div>
  );
}
