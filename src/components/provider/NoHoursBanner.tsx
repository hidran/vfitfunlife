'use client';

import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

const COPY: Record<'review' | 'allOff', { key: MessageKey; tone: 'info' | 'warning' }> = {
  review: { key: 'provider.dashboard.hoursReview', tone: 'info' },
  allOff: { key: 'provider.dashboard.hoursAllOff', tone: 'warning' },
};

/**
 * Shown on the provider dashboard about the provider's bookable hours: 'review' while they
 * have never saved on /provider/availability (they are on the Mon–Fri 09:00–17:00 default
 * without knowing it), 'allOff' once they have switched every day off.
 */
export function NoHoursBanner({ kind }: { kind: 'review' | 'allOff' }) {
  const { t } = useI18n();
  const { key, tone } = COPY[kind];
  const toneClasses = tone === 'warning' ?
    'border-warning/40 bg-warning/15 hover:bg-warning/20 text-warning' :
    'border-info/40 bg-info/15 hover:bg-info/20 text-info';

  return (
    <Link
      href="/provider/availability"
      className={`flex min-h-[44px] items-center gap-3 rounded-xl border p-4 transition-colors ${toneClasses}`}
    >
      <Clock className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{t(key)}</p>
      <ChevronRight className="h-5 w-5 flex-shrink-0" />
    </Link>
  );
}
