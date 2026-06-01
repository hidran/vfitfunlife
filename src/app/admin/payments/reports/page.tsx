"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  ArrowLeft,
  Download,
  TrendingUp,
  PieChart,
  BarChart3,
  Calendar,
  FileText,
} from "lucide-react";

export default function PaymentReportsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [dateRange, setDateRange] = useState("this_month");

  // Mock data
  const revenueByCategory = [
    { category: "Personal Training", amount: 45200, percentage: 45 },
    { category: "Yoga Classes", amount: 28500, percentage: 28 },
    { category: "Massage Therapy", amount: 15300, percentage: 15 },
    { category: "Nutrition Consultation", amount: 7200, percentage: 7 },
    { category: "Other Services", amount: 4800, percentage: 5 },
  ];

  const commissionBreakdown = {
    totalRevenue: 101000,
    platformCommission: 15150,
    providerPayouts: 85850,
    refunds: 2300,
    netRevenue: 12850,
  };

  const topProviders = [
    { name: "John Smith", revenue: 12500, commission: 1875, bookings: 45 },
    { name: "Sarah Johnson", revenue: 10800, commission: 1620, bookings: 38 },
    { name: "Mike Davis", revenue: 9200, commission: 1380, bookings: 32 },
    { name: "Emily Brown", revenue: 7800, commission: 1170, bookings: 28 },
    { name: "Chris Wilson", revenue: 6500, commission: 975, bookings: 25 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/payments")}
          className="text-content-muted"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('admin.reports.back')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('admin.reports.title')}</h1>
          <p className="text-content-muted mt-1">
            {t('admin.reports.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2.5 bg-surface border border-hairline rounded-xl text-content text-sm focus:outline-none focus:border-[#00C9FF]/50"
          >
            <option value="today">{t('admin.reports.dateRange.today')}</option>
            <option value="this_week">{t('admin.reports.dateRange.thisWeek')}</option>
            <option value="this_month">{t('admin.reports.dateRange.thisMonth')}</option>
            <option value="last_month">{t('admin.reports.dateRange.lastMonth')}</option>
            <option value="this_quarter">{t('admin.reports.dateRange.thisQuarter')}</option>
            <option value="this_year">{t('admin.reports.dateRange.thisYear')}</option>
          </select>
          <Button variant="secondary" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            {t('admin.reports.exportPdf')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#10B981]" />
            </div>
            <span className="text-sm text-content-muted">{t('admin.reports.stat.totalRevenue')}</span>
          </div>
          <p className="text-2xl font-bold text-content">
            {formatPrice(commissionBreakdown.totalRevenue)}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <span className="text-sm text-content-muted">{t('admin.reports.stat.platformCommission')}</span>
          </div>
          <p className="text-2xl font-bold text-content">
            {formatPrice(commissionBreakdown.platformCommission)}
          </p>
          <p className="text-xs text-content-faint mt-1">{t('admin.reports.stat.commissionNote')}</p>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <span className="text-sm text-content-muted">{t('admin.reports.stat.providerPayouts')}</span>
          </div>
          <p className="text-2xl font-bold text-content">
            {formatPrice(commissionBreakdown.providerPayouts)}
          </p>
          <p className="text-xs text-content-faint mt-1">{t('admin.reports.stat.payoutsNote')}</p>
        </div>
        <div className="bg-surface rounded-xl border border-hairline p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <span className="text-sm text-content-muted">{t('admin.reports.stat.netRevenue')}</span>
          </div>
          <p className="text-2xl font-bold text-content">
            {formatPrice(commissionBreakdown.netRevenue)}
          </p>
          <p className="text-xs text-content-faint mt-1">{t('admin.reports.stat.netRevenueNote')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Category */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-[#00C9FF]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-content">
                  {t('admin.reports.revenueByCategory.title')}
                </h3>
                <p className="text-sm text-content-muted">{t('admin.reports.revenueByCategory.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {revenueByCategory.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-content">{item.category}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-content-muted">
                      {formatPrice(item.amount)}
                    </span>
                    <span className="text-sm font-medium text-content w-10 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00C9FF] to-[#7B61FF] rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Providers */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-content">{t('admin.reports.topProviders.title')}</h3>
                <p className="text-sm text-content-muted">{t('admin.reports.topProviders.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {topProviders.map((provider, index) => (
              <div
                key={provider.name}
                className="flex items-center gap-4 p-3 bg-surface-sunken rounded-xl"
              >
                <span className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-content-muted">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-content truncate">{provider.name}</p>
                  <p className="text-xs text-content-muted">{t('admin.reports.topProviders.bookings', { count: String(provider.bookings) })}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-content">
                    {formatPrice(provider.revenue)}
                  </p>
                  <p className="text-xs text-[#10B981]">
                    {t('admin.reports.topProviders.commissionPrefix', { amount: formatPrice(provider.commission) })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart Placeholder */}
      <div className="bg-surface rounded-2xl border border-hairline p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content">{t('admin.reports.revenueTrend.title')}</h3>
              <p className="text-sm text-content-muted">{t('admin.reports.revenueTrend.subtitle')}</p>
            </div>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center bg-surface-sunken rounded-xl">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-content-faint mx-auto mb-3" />
            <p className="text-content-faint">{t('admin.reports.revenueTrend.placeholder')}</p>
            <p className="text-content-faint text-sm">{t('admin.reports.revenueTrend.connectAnalytics')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
