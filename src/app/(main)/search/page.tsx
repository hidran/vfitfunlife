'use client';

import { useState } from 'react';
import { Search, MapPin, Filter, X } from 'lucide-react';
import { useSection } from '@/contexts/SectionContext';
import { cn } from '@/lib/utils';

export default function SearchPage() {
  const { section } = useSection();
  const [query, setQuery] = useState('');
  const [recentSearches] = useState([
    'Yoga Milano',
    'Personal trainer',
    'Massaggi',
    'Palestra centro',
  ]);

  const suggestions = {
    fit: ['Palestre', 'Corsi fitness', 'Personal trainer', 'Yoga', 'Pilates', 'CrossFit'],
    fun: ['Eventi', 'VR Experience', 'Party', 'DJ Set', 'Gaming'],
    life: ['Spa', 'Massaggi', 'Parrucchiere', 'Estetista', 'Fisioterapia'],
  };

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
            placeholder="Cerca palestre, corsi, servizi..."
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
            <span>Milano</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-background-secondary/10 rounded-full text-sm text-text-secondary">
            <Filter className="w-4 h-4" />
            <span>Filtri</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Recent Searches */}
        {!query && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Ricerche recenti</h3>
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
              Suggerimenti per {section === 'fit' ? 'VFit' : section === 'fun' ? 'VFun' : 'VLife'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {suggestions[section].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(suggestion)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm transition-colors',
                    'bg-[var(--section-primary)]/10 text-[var(--section-primary)]',
                    'hover:bg-[var(--section-primary)]/20'
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Search Results Placeholder */}
        {query && (
          <section>
            <p className="text-text-secondary text-center py-12">
              Ricerca &quot;{query}&quot; in corso...
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
