'use client';

/**
 * The fixed legal banner — P2-6, spec §12.1.
 *
 * This is NOT decoration. Under Italian law only medici, biologi nutrizionisti and dietisti
 * may prescribe a diet, and the platform's defence is that every recipe surface says, in
 * writing, that these are informational suggestions. It must render on EVERY screen that
 * shows a recipe, in both the trainer app and the client app. Do not make it dismissible,
 * do not hide it behind a disclosure, do not render it conditionally.
 */

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export function RecipeDisclaimer({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-hairline bg-surface-input px-3 py-2 text-xs text-content-muted',
        className,
      )}
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <span>{t('recipes.disclaimer')}</span>
    </p>
  );
}

export default RecipeDisclaimer;
