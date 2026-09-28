import { cn } from '@/lib/utils';

/**
 * Sized stand-in shown by `next/dynamic`'s `loading` option while the GoogleMap chunk
 * (and its @googlemaps/js-api-loader dependency) downloads on the client.
 *
 * Kept intentionally free of hooks/i18n: `next/dynamic`'s `loading` component can render
 * before the rest of the client bundle (translations included) has finished loading, so this
 * mirrors GoogleMap's own internal loading frame (same background/border/spinner) without
 * depending on anything that isn't in the initial bundle.
 *
 * `className` must match the size the call site was already passing to `GoogleMap` — that is
 * what actually prevents layout shift; this component only supplies the look.
 */
export function MapPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-2xl border border-hairline bg-background-dark',
        className
      )}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-content/20 border-t-section-primary" />
    </div>
  );
}
