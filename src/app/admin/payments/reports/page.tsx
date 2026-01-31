"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
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
          className="text-white/60"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Reports</h1>
          <p className="text-white/50 mt-1">
            Revenue analysis and commission breakdown
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2.5 bg-[#1E2230] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-[#00C9FF]/50"
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
          </select>
          <Button variant="secondary" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#10B981]" />
            </div>
            <span className="text-sm text-white/50">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatPrice(commissionBreakdown.totalRevenue)}
          </p>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-[#00C9FF]" />
            </div>
            <span className="text-sm text-white/50">Platform Commission</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatPrice(commissionBreakdown.platformCommission)}
          </p>
          <p className="text-xs text-white/40 mt-1">15% of revenue</p>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <span className="text-sm text-white/50">Provider Payouts</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatPrice(commissionBreakdown.providerPayouts)}
          </p>
          <p className="text-xs text-white/40 mt-1">85% of revenue</p>
        </div>
        <div className="bg-[#1E2230] rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <span className="text-sm text-white/50">Net Revenue</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatPrice(commissionBreakdown.netRevenue)}
          </p>
          <p className="text-xs text-white/40 mt-1">After refunds</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Category */}
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-[#00C9FF]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Revenue by Category
                </h3>
                <p className="text-sm text-white/50">Distribution across service types</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {revenueByCategory.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white">{item.category}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-white/50">
                      {formatPrice(item.amount)}
                    </span>
                    <span className="text-sm font-medium text-white w-10 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
        <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#10B981]/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Top Providers</h3>
                <p className="text-sm text-white/50">By revenue generated</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {topProviders.map((provider, index) => (
              <div
                key={provider.name}
                className="flex items-center gap-4 p-3 bg-black/20 rounded-xl"
              >
                <span className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-white/50">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{provider.name}</p>
                  <p className="text-xs text-white/50">{provider.bookings} bookings</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-white">
                    {formatPrice(provider.revenue)}
                  </p>
                  <p className="text-xs text-[#10B981]">
                    +{formatPrice(provider.commission)} commission
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart Placeholder */}
      <div className="bg-[#1E2230] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#7B61FF]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Revenue Trend</h3>
              <p className="text-sm text-white/50">Monthly revenue over time</p>
            </div>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center bg-black/20 rounded-xl">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40">Revenue trend chart will be displayed here</p>
            <p className="text-white/30 text-sm">Connect to analytics API</p>
          </div>
        </div>
      </div>
    </div>
  );
}
