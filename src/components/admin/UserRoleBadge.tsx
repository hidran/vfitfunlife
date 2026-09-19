"use client";

import { cn } from "@/lib/utils";
import { UserRole } from "@/types/firebase";
import { useI18n } from "@/hooks/useI18n";

interface UserRoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md";
  className?: string;
}

const roleColors: Record<UserRole, string> = {
  superadmin: "bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/30",
  admin: "bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30",
  provider: "bg-[#00C9FF]/20 text-[#00C9FF] border-[#00C9FF]/30",
  customer: "bg-surface-2 text-content-muted border-white/20",
};

export function UserRoleBadge({ role, size = "md", className }: UserRoleBadgeProps) {
  const { t } = useI18n();
  const labelKey = {
    superadmin: 'admin.role.superadmin',
    admin: 'admin.role.admin',
    provider: 'admin.role.provider',
    customer: 'admin.role.customer',
  }[role] as 'admin.role.superadmin' | 'admin.role.admin' | 'admin.role.provider' | 'admin.role.customer';

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        roleColors[role],
        className
      )}
    >
      {t(labelKey)}
    </span>
  );
}

interface StatusBadgeProps {
  status: "active" | "suspended" | "pending" | "verified" | "rejected" | "completed" | "cancelled" | "confirmed" | "failed" | "deleted" | "demo";
  size?: "sm" | "md";
  className?: string;
}

const statusColors: Record<string, string> = {
  active: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  suspended: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  pending: "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
  verified: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  rejected: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  completed: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  cancelled: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  confirmed: "bg-[#00C9FF]/20 text-[#00C9FF] border-[#00C9FF]/30",
  failed: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  deleted: "bg-white/10 text-content-muted border-white/20",
  demo: "bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30",
};

type KnownStatus = 'active' | 'suspended' | 'pending' | 'verified' | 'rejected' | 'completed' | 'cancelled' | 'confirmed' | 'failed' | 'deleted' | 'demo';
const statusLabelKeys: Record<KnownStatus, string> = {
  active: 'admin.status.active',
  suspended: 'admin.status.suspended',
  pending: 'admin.status.pending',
  verified: 'admin.status.verified',
  rejected: 'admin.status.rejected',
  completed: 'admin.status.completed',
  cancelled: 'admin.status.cancelled',
  confirmed: 'admin.status.confirmed',
  failed: 'admin.status.failed',
  deleted: 'admin.status.deleted',
  demo: 'admin.status.demo',
};

export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const { t } = useI18n();
  const color = statusColors[status];

  if (!color) {
    return (
      <span
        className={cn(
          "inline-flex items-center font-medium rounded-full border bg-surface-2 text-content-muted border-white/20",
          size === "sm" && "px-2 py-0.5 text-[10px]",
          size === "md" && "px-2.5 py-1 text-xs",
          className
        )}
      >
        {status}
      </span>
    );
  }

  const labelKey = statusLabelKeys[status as KnownStatus];

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        color,
        className
      )}
    >
      {t(labelKey as Parameters<typeof t>[0])}
    </span>
  );
}

interface VerificationBadgeProps {
  isVerified: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function VerificationBadge({ isVerified, size = "md", className }: VerificationBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        isVerified
          ? "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30"
          : "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
        className
      )}
    >
      {isVerified ? t('admin.badge.verified') : t('admin.badge.pending')}
    </span>
  );
}

/**
 * Turn a provider userType slug into a human-readable label
 * ("personal_trainer" -> "Personal Trainer"). Returns null when absent so the
 * caller can show a localized "Not specified" fallback.
 */
export function formatProviderType(userType?: string | null): string | null {
  if (!userType || typeof userType !== "string") return null;
  const cleaned = userType.trim();
  if (!cleaned) return null;
  return cleaned
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface ProviderTypeBadgeProps {
  userType?: string | null;
  size?: "sm" | "md";
  className?: string;
}

export function ProviderTypeBadge({ userType, size = "md", className }: ProviderTypeBadgeProps) {
  const { t } = useI18n();
  const label = formatProviderType(userType);
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        className
      )}
    >
      {label ?? t('admin.providers.type.unspecified')}
    </span>
  );
}
