"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/stores/adminStore";
import { useAuthStore } from "@/stores/authStore";
import {
  StatCard,
  StatsGrid,
  ActivityFeed,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import {
  Users,
  Store,
  Calendar,
  Euro,
  AlertCircle,
  Ticket,
  TrendingUp,
  ArrowRight,
  Plus,
  FileText,
  Megaphone,
} from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    dashboardStats,
    isLoadingStats,
    fetchDashboardStats,
    pendingVerifications,
    fetchPendingVerifications,
  } = useAdminStore();

  useEffect(() => {
    fetchDashboardStats();
    fetchPendingVerifications();
  }, [fetchDashboardStats, fetchPendingVerifications]);

  const isSuperadmin = user?.role === "superadmin";

  const quickActions = [
    {
      label: "Verify Provider",
      icon: <Users className="w-4 h-4" />,
      onClick: () => router.push("/admin/providers/verifications"),
      visible: true,
    },
    {
      label: "View Report",
      icon: <FileText className="w-4 h-4" />,
      onClick: () => router.push("/admin/payments/reports"),
      visible: true,
    },
    {
      label: "Send Announcement",
      icon: <Megaphone className="w-4 h-4" />,
      onClick: () => {},
      visible: isSuperadmin,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/50 mt-1">
            Welcome back, {user?.fullName?.split(" ")[0]}
          </p>
        </div>
        <div className="flex gap-2">
          {quickActions
            .filter((a) => a.visible)
            .map((action) => (
              <Button
                key={action.label}
                variant="secondary"
                size="sm"
                onClick={action.onClick}
                className="flex items-center gap-2"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid>
        <StatCard
          title="Total Users"
          value={dashboardStats?.totalUsers.toLocaleString() || "0"}
          trend={dashboardStats?.userGrowth}
          trendLabel="vs last month"
          icon="users"
          onClick={() => router.push("/admin/users")}
        />
        <StatCard
          title="Active Providers"
          value={dashboardStats?.activeProviders.toLocaleString() || "0"}
          trend={dashboardStats?.providerGrowth}
          trendLabel="vs last month"
          icon="providers"
          onClick={() => router.push("/admin/providers")}
        />
        <StatCard
          title="Today's Bookings"
          value={dashboardStats?.todayBookings.toLocaleString() || "0"}
          trend={dashboardStats?.bookingGrowth}
          trendLabel="vs yesterday"
          icon="bookings"
          onClick={() => router.push("/admin/bookings")}
        />
        <StatCard
          title="Monthly Revenue"
          value={formatPrice(dashboardStats?.monthlyRevenue || 0)}
          trend={dashboardStats?.revenueGrowth}
          trendLabel="vs last month"
          icon="revenue"
          onClick={() => router.push("/admin/payments")}
        />
      </StatsGrid>

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pending Verifications */}
        <div className="bg-gradient-to-br from-[#F59E0B]/10 to-[#F59E0B]/5 rounded-2xl border border-[#F59E0B]/20 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Pending Verifications</h3>
                <p className="text-sm text-white/50">
                  {dashboardStats?.pendingVerifications || 0} providers awaiting review
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/admin/providers/verifications")}
              className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
            >
              Review
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Open Tickets */}
        <div className="bg-gradient-to-br from-[#EF4444]/10 to-[#EF4444]/5 rounded-2xl border border-[#EF4444]/20 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-[#EF4444]" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Support Tickets</h3>
                <p className="text-sm text-white/50">
                  {dashboardStats?.openTickets || 0} open tickets require attention
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
            >
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Charts & Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Charts Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Revenue Chart Placeholder */}
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Revenue Overview</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white/60">
                  Week
                </Button>
                <Button variant="secondary" size="sm">
                  Month
                </Button>
                <Button variant="ghost" size="sm" className="text-white/60">
                  Year
                </Button>
              </div>
            </div>
            <div className="h-64 flex items-center justify-center bg-black/20 rounded-xl">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">Revenue chart will be displayed here</p>
                <p className="text-white/30 text-sm">Connect to analytics API</p>
              </div>
            </div>
          </div>

          {/* User Growth Chart Placeholder */}
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">User Registration Trend</h3>
              <span className="text-sm text-white/50">Last 30 days</span>
            </div>
            <div className="h-48 flex items-center justify-center bg-black/20 rounded-xl">
              <div className="text-center">
                <Users className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">User growth chart will be displayed here</p>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-1">
          <ActivityFeed
            activities={dashboardStats?.recentActivity || []}
            className="h-full"
          />
        </div>
      </div>

      {/* Bottom Section - Bookings by Status & Top Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookings by Status */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Bookings by Status</h3>
          <div className="space-y-4">
            {[
              { label: "Completed", value: 65, color: "bg-[#10B981]" },
              { label: "Confirmed", value: 20, color: "bg-[#00C9FF]" },
              { label: "Pending", value: 10, color: "bg-[#F59E0B]" },
              { label: "Cancelled", value: 5, color: "bg-[#EF4444]" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/70">{item.label}</span>
                  <span className="text-sm text-white">{item.value}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", item.color)}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Providers */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Top Providers</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/admin/providers")}
              className="text-[#00C9FF]"
            >
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="space-y-4">
            {[
              { name: "John Smith", bookings: 45, revenue: 3200 },
              { name: "Sarah Johnson", bookings: 38, revenue: 2800 },
              { name: "Mike Davis", bookings: 32, revenue: 2400 },
              { name: "Emily Brown", bookings: 28, revenue: 2100 },
              { name: "Chris Wilson", bookings: 25, revenue: 1800 },
            ].map((provider, index) => (
              <div
                key={provider.name}
                className="flex items-center gap-4 p-3 bg-black/20 rounded-xl"
              >
                <span className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-white/50">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{provider.name}</p>
                  <p className="text-sm text-white/50">{provider.bookings} bookings</p>
                </div>
                <span className="font-semibold text-white">
                  {formatPrice(provider.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
