'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { useMyLocation } from '@/hooks/useMyLocation';
import { needsLocation } from '@/lib/providerLocation';
import { cn } from '@/lib/utils';

/**
 * Per browser session: dismissing hides the banner until the next session, not forever —
 * a provider without coordinates is invisible in "near me" search, so the nudge comes back
 * until they set a location.
 */
export const DISMISS_KEY = 'vfit.missingLocationBanner.dismissed';

function readDismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Nudges the signed-in provider to set their location when their instructor document has
 * no coordinates. Links to /provider/location; renders nothing once they have one.
 */
export function MissingLocationBanner({ className }: { className?: string }) {
  const { t } = useI18n();
  const uid = useAuthStore((s) => s.user?.id);
  const { data: location } = useMyLocation(uid);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || !needsLocation(location)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode or blocked storage: hidden for this page view only.
    }
  };

  return (
    <div
      role="region"
      aria-label={t('provider.location.banner.label')}
      className={cn(
        'flex items-stretch gap-1 rounded-xl border border-warning/40 bg-warning/15 text-warning',
        className
      )}
    >
      <Link
        href="/provider/location"
        className="flex min-h-[44px] flex-1 items-center gap-3 rounded-xl p-4 transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
      >
        <MapPin className="h-5 w-5 flex-shrink-0" aria-hidden />
        <p className="flex-1 text-sm font-medium">{t('provider.location.banner.text')}</p>
        <ChevronRight className="h-5 w-5 flex-shrink-0" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('provider.location.banner.dismiss')}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
