'use client';

/**
 * Pilot-mode guard for the VLife section.
 *
 * Hiding the tab is not enough: a bookmark, a push deep link or a search result would
 * still land here. Redirects to /home while the section is flagged off.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { Spinner } from '@/components/ui/Spinner';

export default function LifeSectionLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  // Shared cache key with /fun's layout: both guards read the same Remote Config fetch, so
  // navigating between them (or mounting both, e.g. in tests) dedupes to a single fetch. The
  // whole module is loaded dynamically inside queryFn — never at module scope — because it
  // must never initialise under `output: 'export'`'s server render pass.
  const { data } = useQuery({
    queryKey: queryKeys.pilotFlags(),
    queryFn: async () => {
      const { loadPilotFlags, isSectionVisible } = await import('@/lib/firebase/remoteConfig');
      return { flags: await loadPilotFlags(), isSectionVisible };
    },
  });
  const allowed = data ? data.isSectionVisible('life', data.flags) : null;

  useEffect(() => {
    if (allowed === false) router.replace('/home');
  }, [allowed, router]);

  // Render nothing until resolved: flashing the section before redirecting would advertise
  // that it exists, which is the thing pilot mode exists to avoid.
  if (allowed !== true) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return <>{children}</>;
}
