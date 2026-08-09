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

const getInitialSection = (): Section => {
  if (typeof window === 'undefined') {
    return 'fit';
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Section | null;
    if (saved && VALID_SECTIONS.includes(saved)) {
      return saved;
    }
  } catch {
    // Silently fail if localStorage is unavailable (private mode, disabled, etc.)
    console.warn('Failed to read section preference from localStorage');
  }

  return 'fit';
};

export function SectionProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>(getInitialSection);

  // A returning user whose stored preference is a hidden section would otherwise boot
  // straight into it. Hiding the entrances is not enough — the preference itself has to be
  // coerced back. Imported lazily to keep Remote Config out of the module graph on the
  // server render pass under output:'export'.
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/firebase/remoteConfig').then(async ({ loadPilotFlags, isSectionVisible }) => {
      const flags = await loadPilotFlags();
      if (cancelled) return;
      setSection((current) => (isSectionVisible(current, flags) ? current : 'fit'));
    });
    return () => { cancelled = true; };
  }, []);

  // Apply section to document for CSS theming
  useEffect(() => {
    document.documentElement.setAttribute('data-section', section);
  }, [section]);

  const handleSetSection = useCallback((newSection: Section) => {
    setSection(newSection);
    try {
      localStorage.setItem(STORAGE_KEY, newSection);
    } catch {
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
