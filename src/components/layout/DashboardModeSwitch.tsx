'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { canAccessProviderArea } from '@/lib/providerStatus';
import type { MessageKey } from '@/i18n/messages';
import { cn } from '@/lib/utils';

interface DashboardModeSwitchProps {
  mode: 'customer' | 'professional';
  className?: string;
  customerLabelKey?: MessageKey;
  professionalLabelKey?: MessageKey;
  onNavigate?: () => void;
}

/** Shows the signed-in user's private home and, when permitted, their privileged dashboard. */
export function DashboardModeSwitch({
  mode,
  className,
  customerLabelKey = 'dashboard.mode.customer',
  professionalLabelKey = 'dashboard.mode.professional',
  onNavigate,
}: DashboardModeSwitchProps) {
  const user = useAuthStore((state) => state.user);
  const { t } = useI18n();
  const isStaff = user?.role === 'admin' || user?.role === 'superadmin';
  // Legacy provider accounts may have stale or missing application status. Their explicit
  // provider role remains authoritative, just as it is in the provider data layer.
  const canAccessProvider =
    canAccessProviderArea(user?.providerStatus) ||
    (user?.role === 'provider' && (user.providerStatus === undefined || user.providerStatus === 'none'));

  if (!user) return null;

  const canSwitchMode = isStaff || canAccessProvider;
  const professionalHref = isStaff ? '/admin' : '/provider/dashboard';
  const professionalLabel = isStaff ? t('dashboard.mode.management') : t(professionalLabelKey);

  return (
    <nav
      aria-label={t('dashboard.mode.navigation')}
      className={cn('grid gap-1 rounded-xl bg-content/10 p-1', canSwitchMode ? 'grid-cols-2' : 'grid-cols-1', className)}
      data-testid="dashboard-mode-switch"
    >
      <Link
        href="/home"
        onClick={onNavigate}
        aria-current={mode === 'customer' ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors',
          mode === 'customer' ? 'bg-surface text-content shadow-sm' : 'text-content-muted hover:text-content'
        )}
      >
        {t(customerLabelKey)}
      </Link>
      {canSwitchMode && (
        <Link
          href={professionalHref}
          onClick={onNavigate}
          aria-current={mode === 'professional' ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors',
            mode === 'professional' ? 'bg-surface text-content shadow-sm' : 'text-content-muted hover:text-content'
          )}
        >
          {professionalLabel}
        </Link>
      )}
    </nav>
  );
}
