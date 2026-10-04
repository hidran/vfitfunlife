'use client';

import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/hooks/useI18n';
import { safeHttpUrl } from '@/lib/publicBusiness';
import { cn } from '@/lib/utils';

/**
 * "Azienda" badge for company / association providers. Text plus icon (never colour alone);
 * the same label for every legal form. Render it only for a provider whose `isBusiness` came
 * from a valid `business` map, never from `providerType`.
 */
export function BusinessBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Badge variant="info" size="sm" className={cn('shrink-0', className)}>
      <Building2 aria-hidden="true" className="mr-1 h-3 w-3" />
      {t('provider.badge.business')}
    </Badge>
  );
}

/**
 * The company website as an external link. The scheme is re-checked here, whatever the
 * loader did, so a `javascript:` URL can never become an href. Renders nothing otherwise.
 */
export function BusinessWebsiteLink({ website, className }: { website?: string | null; className?: string }) {
  const { t } = useI18n();
  const href = safeHttpUrl(website);
  if (!href) return null;
  let label = href;
  try {
    label = new URL(href).host;
  } catch {
    /* safeHttpUrl already parsed it */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex min-h-[44px] items-center break-all underline', className)}
    >
      {label}
      <span className="sr-only"> ({t('providerProfile.business.websiteNewTab')})</span>
    </a>
  );
}
