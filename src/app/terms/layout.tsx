import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/** Client page, so the metadata lives in this layout (see privacy/layout.tsx). */

const URL = 'https://vfit-funlife.web.app/terms';

export const metadata: Metadata = {
  title: 'Termini e condizioni',
  description:
    'Condizioni d’uso di Vfitfunlife: prenotazioni, pagamenti, cancellazioni, ' +
    'responsabilità di clienti e professionisti e gestione dei reclami.',
  alternates: { canonical: URL },
  openGraph: { url: URL, type: 'website', locale: 'it_IT', siteName: 'Vfitfunlife' },
  robots: { index: true, follow: true },
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
