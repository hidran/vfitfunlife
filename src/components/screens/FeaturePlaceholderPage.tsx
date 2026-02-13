import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaceholderAction {
  href: string;
  label: string;
}

interface FeaturePlaceholderPageProps {
  title: string;
  description: string;
  badge?: string;
  icon?: LucideIcon;
  notes?: string[];
  primaryAction?: PlaceholderAction;
  secondaryAction?: PlaceholderAction;
  className?: string;
}

export function FeaturePlaceholderPage({
  title,
  description,
  badge = 'Nuova funzionalita in sviluppo',
  icon,
  notes,
  primaryAction,
  secondaryAction,
  className,
}: FeaturePlaceholderPageProps) {
  const Icon = icon ?? Sparkles;

  return (
    <div className={cn('container-mobile py-8', className)}>
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <div className="absolute -top-14 -right-10 h-32 w-32 rounded-full bg-section-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-section-secondary/20 blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {badge}
          </span>

          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary">
              <Icon className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-text-inverse">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                {description}
              </p>
            </div>
          </div>

          {notes && notes.length > 0 && (
            <ul className="mt-5 space-y-2">
              {notes.map((note) => (
                <li
                  key={note}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-tertiary"
                >
                  {note}
                </li>
              ))}
            </ul>
          )}

          {(primaryAction || secondaryAction) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {primaryAction && (
                <Link
                  href={primaryAction.href}
                  className="inline-flex items-center gap-2 rounded-full bg-section-primary px-4 py-2 text-sm font-semibold text-background-dark"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}

              {secondaryAction && (
                <Link
                  href={secondaryAction.href}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-text-inverse"
                >
                  {secondaryAction.label}
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
