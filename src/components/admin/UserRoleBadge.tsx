"use client";

import { cn } from "@/lib/utils";
import { UserRole } from "@/types/firebase";

interface UserRoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md";
  className?: string;
}

const roleConfig: Record<UserRole, { label: string; color: string }> = {
  superadmin: {
    label: "Superadmin",
    color: "bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/30",
  },
  admin: {
    label: "Admin",
    color: "bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30",
  },
  provider: {
    label: "Provider",
    color: "bg-[#00C9FF]/20 text-[#00C9FF] border-[#00C9FF]/30",
  },
  customer: {
    label: "Customer",
    color: "bg-white/10 text-white/70 border-white/20",
  },
};

export function UserRoleBadge({ role, size = "md", className }: UserRoleBadgeProps) {
  const config = roleConfig[role];

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

interface StatusBadgeProps {
  status: "active" | "suspended" | "pending" | "verified" | "rejected" | "completed" | "cancelled" | "confirmed" | "failed";
  size?: "sm" | "md";
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: {
    label: "Active",
    color: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  },
  suspended: {
    label: "Suspended",
    color: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  },
  pending: {
    label: "Pending",
    color: "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30",
  },
  verified: {
    label: "Verified",
    color: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  },
  rejected: {
    label: "Rejected",
    color: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  },
  completed: {
    label: "Completed",
    color: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-[#00C9FF]/20 text-[#00C9FF] border-[#00C9FF]/30",
  },
  failed: {
    label: "Failed",
    color: "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/30",
  },
};

export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (!config) {
    return (
      <span
        className={cn(
          "inline-flex items-center font-medium rounded-full border bg-white/10 text-white/70 border-white/20",
          size === "sm" && "px-2 py-0.5 text-[10px]",
          size === "md" && "px-2.5 py-1 text-xs",
          className
        )}
      >
        {status}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

interface VerificationBadgeProps {
  isVerified: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function VerificationBadge({ isVerified, size = "md", className }: VerificationBadgeProps) {
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
      {isVerified ? "Verified" : "Pending"}
    </span>
  );
}
