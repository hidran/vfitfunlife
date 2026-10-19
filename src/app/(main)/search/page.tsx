'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useSection } from '@/contexts/SectionContext';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useServiceCategoryGroups } from '@/hooks/useServiceCategories';

export default function SearchPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { section } = useSection();
  const categoryGroups = useServiceCategoryGroups().filter(({ group }) => group.sections.includes(section));
  const [query, setQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroup = categoryGroups.find(({ group }) => group.id === selectedGroupId) ?? categoryGroups[0];

  const submitSearch = (value = query, categoryId?: string) => {
    const normalized = value.trim();
    if (categoryId) router.push(`/booking?category=${encodeURIComponent(categoryId)}`);
    else if (normalized) router.push(`/booking?query=${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="min-h-screen bg-background-dark pb-20">
      <div className="sticky top-0 z-10 space-y-3 bg-background-dark/95 p-4 backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary" />
          <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.input.placeholder')}
              className={cn(
                'w-full rounded-xl border border-border/20 bg-content/10 py-3 pl-12 pr-12 text-text-inverse placeholder:text-text-tertiary light:border-hairline',
                'focus:outline-none focus:ring-2 focus:ring-[var(--section-primary)] focus:ring-offset-2 focus:ring-offset-background-dark'
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1"
                aria-label={t('common.search')}
              >
                <X className="h-5 w-5 text-text-tertiary" />
              </button>
            )}
            <button type="submit" className="sr-only">{t('common.search')}</button>
          </form>
        </div>
      </div>

      <div className="space-y-6 p-4">
        {!query && selectedGroup && (
          <section>
            <h3 className="mb-3 text-sm font-medium text-text-secondary">{t('drawer.section.categories')}</h3>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {categoryGroups.map(({ group }) => (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={selectedGroup.group.id === group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    'min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs font-semibold',
                    selectedGroup.group.id === group.id
                      ? 'border-[var(--section-primary)] bg-[var(--section-primary)] text-white'
                      : 'border-content/15 bg-content/5 text-text-secondary'
                  )}
                >
                  {group.icon} {group.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedGroup.leaves.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => submitSearch('', category.id)}
                  className="min-h-11 rounded-full bg-[var(--section-primary)]/10 px-4 py-2 text-sm text-[var(--section-primary)] transition-colors hover:bg-[var(--section-primary)]/20"
                >
                  {category.icon} {category.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {query && (
          <section className="text-center">
            <button
              type="button"
              onClick={() => submitSearch()}
              className="rounded-xl bg-[var(--section-primary)] px-5 py-3 text-sm font-semibold text-white"
            >
              {t('common.search')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
