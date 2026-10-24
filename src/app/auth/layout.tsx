import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Login, registration and password-recovery screens are part of the conversion funnel, not
 * content: they are thin, near-duplicates of each other, and useless to a searcher. Keeping
 * them out of the index also stops crawlers spending budget on them instead of the landing page.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
