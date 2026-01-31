'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Section = 'fit' | 'fun' | 'life';

interface SectionContextValue {
  section: Section;
  setSection: (section: Section) => void;
}

const SectionContext = createContext<SectionContextValue | undefined>(undefined);

const STORAGE_KEY = 'preferredSection';
const VALID_SECTIONS: Section[] = ['fit', 'fun', 'life'];

export function SectionProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('fit');

  // Apply section to document for CSS theming
  useEffect(() => {
    document.documentElement.setAttribute('data-section', section);
  }, [section]);

  // Load saved section preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Section | null;
      if (saved && VALID_SECTIONS.includes(saved)) {
        setSection(saved);
      }
    } catch (e) {
      // Silently fail if localStorage is unavailable (private mode, disabled, etc.)
      console.warn('Failed to read section preference from localStorage');
    }
  }, []);

  const handleSetSection = useCallback((newSection: Section) => {
    setSection(newSection);
    try {
      localStorage.setItem(STORAGE_KEY, newSection);
    } catch (e) {
      // Silently fail if localStorage is unavailable
      console.warn('Failed to save section preference to localStorage');
    }
  }, []);

  return (
    <SectionContext.Provider value={{ section, setSection: handleSetSection }}>
      {children}
    </SectionContext.Provider>
  );
}

export function useSection() {
  const context = useContext(SectionContext);
  if (!context) {
    throw new Error('useSection must be used within a SectionProvider');
  }
  return context;
}
