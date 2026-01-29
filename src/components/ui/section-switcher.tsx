'use client';

import { useSection, type Section } from '@/contexts/SectionContext';
import { cn } from '@/lib/utils';

const sections: { id: Section; label: string }[] = [
  { id: 'fit', label: 'FIT' },
  { id: 'fun', label: 'FUN' },
  { id: 'life', label: 'LIFE' },
];

export function SectionSwitcher() {
  const { section, setSection } = useSection();

  return (
    <div className="flex items-center justify-center p-1 rounded-full bg-background-dark/10 dark:bg-background-dark/20">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => setSection(s.id)}
          className={cn(
            'px-4 py-2 text-sm font-bold rounded-full transition-colors',
            section === s.id
              ? 'bg-white text-gray-900 shadow'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
