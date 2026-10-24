import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The page itself is a client component (it reads the locale), so it cannot export metadata.
 * Without this layout it inherited the site-wide marketing title and — before the root
 * canonical was removed — declared itself a duplicate of `/`.
 */

const URL = 'https://vfit-funlife.web.app/privacy';

export const metadata: Metadata = {
  title: 'Informativa sulla privacy',
  description:
    'Come Vfitfunlife raccoglie, utilizza e protegge i dati personali di clienti e professionisti: ' +
    'base giuridica, conservazione, diritti GDPR e contatti del titolare.',
  alternates: { canonical: URL },
  openGraph: { url: URL, type: 'website', locale: 'it_IT', siteName: 'Vfitfunlife' },
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
