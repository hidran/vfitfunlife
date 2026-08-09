'use client';

/**
 * Pilot-mode guard for the VFun section.
 *
 * Hiding the tab is not enough: a bookmark, a push deep link or a search result would
 * still land here. Redirects to /home while the section is flagged off.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';

export default function FunSectionLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@/lib/firebase/remoteConfig').then(async ({ loadPilotFlags, isSectionVisible }) => {
      const flags = await loadPilotFlags();
      if (cancelled) return;
      const ok = isSectionVisible('fun', flags);
      setAllowed(ok);
      if (!ok) router.replace('/home');
    });
    return () => { cancelled = true; };
  }, [router]);

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
