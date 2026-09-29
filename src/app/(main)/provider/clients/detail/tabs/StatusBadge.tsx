'use client';

import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/useI18n';
import { bookingStatusMeta } from '@/lib/bookingStatus';

/** Translated, tone-coloured booking status for the client detail tabs. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const meta = bookingStatusMeta(status);
  return (
    <Badge variant={meta?.tone ?? 'default'} size="sm">
      {meta ? t(meta.labelKey) : status}
    </Badge>
  );
}
