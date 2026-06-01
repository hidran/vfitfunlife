'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleHelp, LifeBuoy, Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

interface FaqItem {
  id: string;
  questionKey: MessageKey;
  answerKey: MessageKey;
}

const FAQS: FaqItem[] = [
  {
    id: 'f1',
    questionKey: 'help.faq.f1.question',
    answerKey: 'help.faq.f1.answer',
  },
  {
    id: 'f2',
    questionKey: 'help.faq.f2.question',
    answerKey: 'help.faq.f2.answer',
  },
  {
    id: 'f3',
    questionKey: 'help.faq.f3.question',
    answerKey: 'help.faq.f3.answer',
  },
  {
    id: 'f4',
    questionKey: 'help.faq.f4.question',
    answerKey: 'help.faq.f4.answer',
  },
];

export default function HelpPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [openItemId, setOpenItemId] = useState<string | null>(FAQS[0].id);

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAQS;
    return FAQS.filter(
      (faq) =>
        t(faq.questionKey).toLowerCase().includes(normalized) ||
        t(faq.answerKey).toLowerCase().includes(normalized)
    );
  }, [query, t]);

  return (
    <div className="container-mobile py-6 space-y-4 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-section-primary" />
          <h1 className="text-2xl font-bold text-text-inverse">{t('help.title')}</h1>
        </div>
        <p className="text-sm text-text-secondary">
          {t('help.subtitle')}
        </p>
      </header>

      <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
        <label htmlFor="help-search" className="sr-only">
          {t('help.searchLabel')}
        </label>
        <input
          id="help-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('help.searchPlaceholder')}
          className="w-full rounded-xl border border-hairline bg-surface-sunken px-3 py-2.5 text-sm text-content placeholder:text-text-tertiary outline-none focus:border-section-primary"
        />
      </div>

      <section className="space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-surface-2 p-4 text-sm text-text-secondary">
            {t('help.noResults')}
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = openItemId === faq.id;
            return (
              <article key={faq.id} className="overflow-hidden rounded-2xl border border-hairline bg-surface-2">
                <button
                  type="button"
                  onClick={() => setOpenItemId(isOpen ? null : faq.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex items-start gap-2">
                    <CircleHelp className="mt-0.5 h-4 w-4 text-section-primary" />
                    <p className="font-medium text-text-inverse">{t(faq.questionKey)}</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                {isOpen && (
                  <p className="border-t border-hairline px-4 py-3 text-sm text-text-secondary">
                    {t(faq.answerKey)}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/bookings"
          className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-2 p-4 text-sm text-text-secondary transition-colors hover:text-text-inverse"
        >
          <MessageCircle className="h-4 w-4 text-section-primary" />
          {t('help.contactBooking')}
        </Link>
        <a
          href="mailto:support@vfit.app"
          className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-2 p-4 text-sm text-text-secondary transition-colors hover:text-text-inverse"
        >
          <Mail className="h-4 w-4 text-section-primary" />
          {t('help.contactEmail')}
        </a>
      </section>
    </div>
  );
}
