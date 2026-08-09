'use client';

/**
 * Pilot feature flags, resolved once per app load.
 *
 * Starts from the bundled defaults (pilot mode ON) so the first paint is already correct,
 * then swaps in the fetched values. Consumers never see undefined, so there is no
 * "loading" branch to get wrong — the worst case is that a section stays hidden a moment
 * longer than necessary, which is the right way round.
 */

import { useEffect, useState } from 'react';
import {
  DEFAULT_FLAGS,
  isSectionVisible,
  loadPilotFlags,
  type PilotFlags,
} from '@/lib/firebase/remoteConfig';
import type { Section } from '@/contexts/SectionContext';

let cached: PilotFlags | null = null;
let inFlight: Promise<PilotFlags> | null = null;

/** Shared across hook instances so a page with three consumers still fetches once. */
function loadOnce(): Promise<PilotFlags> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = loadPilotFlags().then((f) => {
      cached = f;
      inFlight = null;
      return f;
    });
  }
  return inFlight;
}

export function usePilotFlags(): PilotFlags {
  const [flags, setFlags] = useState<PilotFlags>(cached ?? DEFAULT_FLAGS);

  useEffect(() => {
    let cancelled = false;
    void loadOnce().then((f) => {
      if (!cancelled) setFlags(f);
    });
    return () => { cancelled = true; };
  }, []);

  return flags;
}

/** Convenience for navigation surfaces that just need to filter sections. */
export function useVisibleSections(): Section[] {
  const flags = usePilotFlags();
  return (['fit', 'fun', 'life'] as Section[]).filter((s) => isSectionVisible(s, flags));
}
