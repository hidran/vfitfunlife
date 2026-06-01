'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useI18n } from '@/hooks/useI18n';

export default function SettingsPage() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-text-secondary hover:text-text-inverse transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-sm">{t('auth.common.back')}</span>
      </button>

      <h1 className="text-2xl font-bold text-text-inverse">{t('settings.title')}</h1>

      {/* Appearance */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          {t('settings.appearance')}
        </h2>
        <ThemeToggle />
      </section>
    </div>
  );
}
