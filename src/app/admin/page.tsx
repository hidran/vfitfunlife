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
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/i18n/messages";
import {
  Users,
  AlertCircle,
  Ticket,
  TrendingUp,
  ArrowRight,
  FileText,
  Megaphone,
} from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const {
    dashboardStats,
    isLoadingStats,
    fetchDashboardStats,
    pendingVerifications,
    fetchPendingVerifications,
    providers,
    fetchProviders,
    isLoadingProviders,
  } = useAdminStore();

  useEffect(() => {
    fetchDashboardStats();
    fetchPendingVerifications();
    fetchProviders({ limit: 5, sortBy: 'bookings' });
  }, [fetchDashboardStats, fetchPendingVerifications, fetchProviders]);

  const isSuperadmin = user?.role === "superadmin";

  const quickActions = [
    {
      labelKey: "admin.dashboard.quickAction.verifyProvider" as MessageKey,
      icon: <Users className="w-4 h-4" />,
      onClick: () => router.push("/admin/providers/verifications"),
      visible: true,
    },
    {
      labelKey: "admin.dashboard.quickAction.viewReport" as MessageKey,
      icon: <FileText className="w-4 h-4" />,
      onClick: () => router.push("/admin/payments/reports"),
      visible: true,
    },
    {
      labelKey: "admin.dashboard.quickAction.sendAnnouncement" as MessageKey,
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
          <h1 className="text-2xl font-bold text-white">{t('admin.dashboard.title')}</h1>
          <p className="text-white/50 mt-1">
            {t('admin.dashboard.welcomeBack', { name: user?.fullName?.split(" ")[0] || '' })}
          </p>
        </div>
        <div className="flex gap-2">
          {quickActions
            .filter((a) => a.visible)
            .map((action) => (
              <Button
                key={action.labelKey}
                variant="secondary"
                size="sm"
                onClick={action.onClick}
                className="flex items-center gap-2"
              >
                {action.icon}
                {t(action.labelKey)}
              </Button>
            ))}
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid>
        <StatCard
          title={t('admin.dashboard.stats.totalUsers')}
          value={dashboardStats?.totalUsers.toLocaleString() || "0"}
          trend={dashboardStats?.userGrowth}
          trendLabel={t('admin.dashboard.trend.vsLastMonth')}
          icon="users"
          onClick={() => router.push("/admin/users")}
        />
        <StatCard
          title={t('admin.dashboard.stats.activeProviders')}
          value={dashboardStats?.activeProviders.toLocaleString() || "0"}
          trend={dashboardStats?.providerGrowth}
          trendLabel={t('admin.dashboard.trend.vsLastMonth')}
          icon="providers"
          onClick={() => router.push("/admin/providers")}
        />
        <StatCard
          title={t('admin.dashboard.stats.todayBookings')}
          value={dashboardStats?.todayBookings.toLocaleString() || "0"}
          trend={dashboardStats?.bookingGrowth}
          trendLabel={t('admin.dashboard.trend.vsYesterday')}
          icon="bookings"
          onClick={() => router.push("/admin/bookings")}
        />
        <StatCard
          title={t('admin.dashboard.stats.monthlyRevenue')}
          value={formatPrice(dashboardStats?.monthlyRevenue || 0)}
          trend={dashboardStats?.revenueGrowth}
          trendLabel={t('admin.dashboard.trend.vsLastMonth')}
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
                <h3 className="font-semibold text-white">{t('admin.dashboard.pendingVerifications.title')}</h3>
                <p className="text-sm text-white/50">
                  {t('admin.dashboard.pendingVerifications.subtitle', {
                    count: dashboardStats?.pendingVerifications || 0,
                  })}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/admin/providers/verifications")}
              className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
            >
              {t('admin.dashboard.pendingVerifications.review')}
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
                <h3 className="font-semibold text-white">{t('admin.dashboard.supportTickets.title')}</h3>
                <p className="text-sm text-white/50">
                  {t('admin.dashboard.supportTickets.subtitle', {
                    count: dashboardStats?.openTickets || 0,
                  })}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
            >
              {t('admin.dashboard.supportTickets.viewAll')}
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
              <h3 className="text-lg font-semibold text-white">{t('admin.dashboard.revenueOverview.title')}</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white/60">
                  {t('admin.dashboard.period.week')}
                </Button>
                <Button variant="secondary" size="sm">
                  {t('admin.dashboard.period.month')}
                </Button>
                <Button variant="ghost" size="sm" className="text-white/60">
                  {t('admin.dashboard.period.year')}
                </Button>
              </div>
            </div>
            <div className="h-64 flex items-center justify-center bg-black/20 rounded-xl">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">{t('admin.dashboard.revenueOverview.placeholder')}</p>
                <p className="text-white/30 text-sm">{t('admin.dashboard.connectAnalytics')}</p>
              </div>
            </div>
          </div>

          {/* User Growth Chart Placeholder */}
          <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">{t('admin.dashboard.userTrend.title')}</h3>
              <span className="text-sm text-white/50">{t('admin.dashboard.userTrend.last30Days')}</span>
            </div>
            <div className="h-48 flex items-center justify-center bg-black/20 rounded-xl">
              <div className="text-center">
                <Users className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">{t('admin.dashboard.userTrend.placeholder')}</p>
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
          <h3 className="text-lg font-semibold text-white mb-6">{t('admin.dashboard.bookingsByStatus.title')}</h3>
          <div className="space-y-4">
            {isLoadingStats ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00C9FF]" />
              </div>
            ) : (
              [
                { 
                  label: t('admin.dashboard.status.completed'),
                  value: dashboardStats?.bookingsByStatus?.completed || 0, 
                  color: "bg-[#10B981]" 
                },
                { 
                  label: t('admin.dashboard.status.confirmed'),
                  value: dashboardStats?.bookingsByStatus?.confirmed || 0, 
                  color: "bg-[#00C9FF]" 
                },
                { 
                  label: t('admin.dashboard.status.pending'),
                  value: dashboardStats?.bookingsByStatus?.pending || 0, 
                  color: "bg-[#F59E0B]" 
                },
                { 
                  label: t('admin.dashboard.status.cancelled'),
                  value: dashboardStats?.bookingsByStatus?.cancelled || 0, 
                  color: "bg-[#EF4444]" 
                },
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
              ))
            )}
          </div>
        </div>

        {/* Top Providers */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">{t('admin.dashboard.topProviders.title')}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/admin/providers")}
              className="text-[#00C9FF]"
            >
              {t('admin.dashboard.topProviders.viewAll')}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="space-y-4">
            {isLoadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00C9FF]" />
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/50">{t('admin.dashboard.topProviders.empty')}</p>
              </div>
            ) : (
              providers.slice(0, 5).map((provider, index) => (
                <div
                  key={provider.id}
                  className="flex items-center gap-4 p-3 bg-black/20 rounded-xl"
                >
                  <span className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-white/50">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{provider.fullName}</p>
                    <p className="text-sm text-white/50">
                      {t('admin.dashboard.topProviders.bookings', {
                        count: (provider as any).performanceMetrics?.totalBookings || 0,
                      })}
                    </p>
                  </div>
                  <span className="font-semibold text-white">
                    {formatPrice((provider as any).performanceMetrics?.totalRevenue || 0)}
                  </span>
                </div>
              ))
            )}
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
