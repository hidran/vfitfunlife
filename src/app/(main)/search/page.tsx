'use client';

import { useMemo, useState } from 'react';
import { Search, MapPin, Filter, X } from 'lucide-react';
import { useSection } from '@/contexts/SectionContext';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';

const recentSearchKeys: MessageKey[] = [
  'search.recent.yogaMilano',
  'search.recent.personalTrainer',
  'search.recent.massages',
  'search.recent.gymCenter',
];

const suggestionsBySection: Record<'fit' | 'fun' | 'life', MessageKey[]> = {
  fit: [
    'search.suggestion.fit.gyms',
    'search.suggestion.fit.classes',
    'search.suggestion.fit.personalTrainer',
    'search.suggestion.fit.yoga',
    'search.suggestion.fit.pilates',
    'search.suggestion.fit.crossfit',
  ],
  fun: [
    'search.suggestion.fun.events',
    'search.suggestion.fun.vr',
    'search.suggestion.fun.party',
    'search.suggestion.fun.djSet',
    'search.suggestion.fun.gaming',
  ],
  life: [
    'search.suggestion.life.spa',
    'search.suggestion.life.massages',
    'search.suggestion.life.hairdresser',
    'search.suggestion.life.beautician',
    'search.suggestion.life.physiotherapy',
  ],
};

const sectionLabelKeys: Record<'fit' | 'fun' | 'life', MessageKey> = {
  fit: 'search.section.fit',
  fun: 'search.section.fun',
  life: 'search.section.life',
};

export default function SearchPage() {
  const { t } = useI18n();
  const { section } = useSection();
  const [query, setQuery] = useState('');
  const recentSearches = useMemo(
    () => recentSearchKeys.map((key) => t(key)),
    [t]
  );
  const suggestions = suggestionsBySection[section];

  return (
    <div className="min-h-screen bg-background-dark pb-20">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.input.placeholder')}
            className={cn(
              'w-full pl-12 pr-12 py-3 bg-background-secondary/10 border border-border/20',
              'rounded-xl text-text-inverse placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-dark',
              'focus:ring-[var(--section-primary)]'
            )}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1"
            >
              <X className="w-5 h-5 text-text-tertiary" />
            </button>
          )}
        </div>

        {/* Location & Filter */}
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-background-secondary/10 rounded-full text-sm text-text-secondary">
            <MapPin className="w-4 h-4" />
            <span>{t('search.location.default')}</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-background-secondary/10 rounded-full text-sm text-text-secondary">
            <Filter className="w-4 h-4" />
            <span>{t('search.filters')}</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Recent Searches */}
        {!query && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-3">{t('search.recent.title')}</h3>
            <div className="space-y-2">
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(search)}
                  className="flex items-center gap-3 w-full p-3 bg-background-secondary/5 rounded-lg text-left hover:bg-background-secondary/10 transition-colors"
                >
                  <Search className="w-4 h-4 text-text-tertiary" />
                  <span className="text-text-inverse">{search}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Suggestions */}
        {!query && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-3">
              {t('search.suggestionsFor', { section: t(sectionLabelKeys[section]) })}
            </h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestionKey, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(t(suggestionKey))}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm transition-colors',
                    'bg-[var(--section-primary)]/10 text-[var(--section-primary)]',
                    'hover:bg-[var(--section-primary)]/20'
                  )}
                >
                  {t(suggestionKey)}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Search Results Placeholder */}
        {query && (
          <section>
            <p className="text-text-secondary text-center py-12">
              {t('search.inProgress', { query })}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
