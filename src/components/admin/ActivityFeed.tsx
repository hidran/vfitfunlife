"use client";

import { cn } from "@/lib/utils";
import { ActivityItem } from "@/types/admin";
import {
  UserPlus,
  UserCheck,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  FileText,
} from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/i18n/messages";

interface ActivityFeedProps {
  activities: ActivityItem[];
  className?: string;
}

const activityIcons: Record<string, React.ReactNode> = {
  user: <UserPlus className="w-4 h-4" />,
  provider: <UserCheck className="w-4 h-4" />,
  booking: <Calendar className="w-4 h-4" />,
  payment: <CreditCard className="w-4 h-4" />,
  system: <Settings className="w-4 h-4" />,
  verification: <CheckCircle className="w-4 h-4" />,
};

const activityColors: Record<string, string> = {
  user: "bg-[#00C9FF]/20 text-[#00C9FF]",
  provider: "bg-[#7B61FF]/20 text-[#7B61FF]",
  booking: "bg-[#F59E0B]/20 text-[#F59E0B]",
  payment: "bg-[#10B981]/20 text-[#10B981]",
  system: "bg-white/10 text-white/60",
  verification: "bg-[#10B981]/20 text-[#10B981]",
};

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  const { t } = useI18n();

  if (activities.length === 0) {
    return (
      <div className={cn("bg-[#1E2230] rounded-2xl border border-white/10 p-6", className)}>
        <h3 className="text-lg font-semibold text-white mb-4">{t('admin.activity.title')}</h3>
        <div className="text-center py-8">
          <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">{t('admin.activity.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-[#1E2230] rounded-2xl border border-white/10 p-6", className)}>
      <h3 className="text-lg font-semibold text-white mb-4">{t('admin.activity.title')}</h3>
      
      <div className="space-y-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex gap-3">
            {/* Icon */}
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                activityColors[activity.type]
              )}
            >
              {activityIcons[activity.type]}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">
                    {activity.action}
                  </p>
                  <p className="text-sm text-white/50 mt-0.5">
                    {activity.description}
                  </p>
                  {activity.userName && (
                    <p className="text-xs text-white/40 mt-1">
                      {t('admin.activity.byUser', { user: activity.userName })}
                    </p>
                  )}
                </div>
                <span className="text-xs text-white/40 whitespace-nowrap">
                  {formatTimestamp(activity.timestamp, t)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(
  timestamp: { toDate: () => Date } | Date | string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  const date = typeof timestamp === "object" && "toDate" in timestamp 
    ? timestamp.toDate() 
    : new Date(timestamp as string);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('admin.activity.time.justNow');
  if (diffMins < 60) return t('admin.activity.time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('admin.activity.time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('admin.activity.time.daysAgo', { count: diffDays });
  return date.toLocaleDateString();
}
