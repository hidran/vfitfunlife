'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

const EFFECTIVE_DATE = '13 febbraio 2026';

export default function TermsPage() {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-background-dark">
      <div className="container-mobile py-8 pb-20 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-section-primary" />
            <h1 className="text-2xl font-bold text-text-inverse">{t('terms.title')}</h1>
          </div>
          <p className="text-sm text-text-secondary">{t('terms.effectiveDateLabel')} {EFFECTIVE_DATE}</p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-text-secondary">
          <p>{t('terms.intro')}</p>
        </section>

        <section className="space-y-4 text-sm text-text-secondary">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">{t('terms.s1.title')}</h2>
            <p className="mt-2">{t('terms.s1.body')}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">{t('terms.s2.title')}</h2>
            <p className="mt-2">{t('terms.s2.body')}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">{t('terms.s3.title')}</h2>
            <p className="mt-2">{t('terms.s3.body')}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">{t('terms.s4.title')}</h2>
            <p className="mt-2">{t('terms.s4.body')}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="font-semibold text-text-inverse">{t('terms.s5.title')}</h2>
            <p className="mt-2">
              {t('terms.s5.body')} <a className="text-section-primary" href="mailto:legal@vfit.app">legal@vfit.app</a>
            </p>
          </article>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/privacy"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            {t('terms.linkToPrivacy')}
          </Link>
          <Link
            href="/auth/login"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-inverse"
          >
            {t('terms.backToLogin')}
          </Link>
        </div>
      </div>
    </main>
  );
}
