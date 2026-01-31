"use client";

import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Store,
  Calendar,
  Euro,
  AlertCircle,
  Ticket,
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon: "users" | "providers" | "bookings" | "revenue" | "verifications" | "tickets";
  onClick?: () => void;
  className?: string;
}

const iconMap = {
  users: Users,
  providers: Store,
  bookings: Calendar,
  revenue: Euro,
  verifications: AlertCircle,
  tickets: Ticket,
};

export function StatCard({
  title,
  value,
  trend,
  trendLabel,
  icon,
  onClick,
  className,
}: StatCardProps) {
  const Icon = iconMap[icon];
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-[#1E2230] rounded-2xl p-6 border border-white/10",
        onClick && "cursor-pointer hover:border-white/20 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-white">{value}</h3>
          
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive && (
                <TrendingUp className="w-4 h-4 text-[#10B981]" />
              )}
              {isNegative && (
                <TrendingDown className="w-4 h-4 text-[#EF4444]" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive && "text-[#10B981]",
                  isNegative && "text-[#EF4444]",
                  !isPositive && !isNegative && "text-white/50"
                )}
              >
                {isPositive ? "+" : ""}
                {trend}%
              </span>
              {trendLabel && (
                <span className="text-sm text-white/40 ml-1">{trendLabel}</span>
              )}
            </div>
          )}
        </div>

        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00C9FF]/20 to-[#7B61FF]/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-[#00C9FF]" />
        </div>
      </div>
    </div>
  );
}

interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
}

export function StatsGrid({ children, className }: StatsGridProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4", className)}>
      {children}
    </div>
  );
}
