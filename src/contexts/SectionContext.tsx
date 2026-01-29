'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Section = 'fit' | 'fun' | 'life';

interface SectionContextValue {
  section: Section;
  setSection: (section: Section) => void;
}

const SectionContext = createContext<SectionContextValue | undefined>(undefined);

export function SectionProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('fit');

  // Apply section to document for CSS theming
  useEffect(() => {
    document.documentElement.setAttribute('data-section', section);
  }, [section]);

  // Load saved section preference
  useEffect(() => {
    const saved = localStorage.getItem('preferredSection') as Section | null;
    if (saved && ['fit', 'fun', 'life'].includes(saved)) {
      setSection(saved);
    }
  }, []);

  const handleSetSection = (newSection: Section) => {
    setSection(newSection);
    localStorage.setItem('preferredSection', newSection);
  };

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
