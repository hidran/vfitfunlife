import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import {
  findTorinoLanding,
  TORINO_LANDINGS,
  torinoLandingUrl,
  type TorinoLanding,
} from '@/lib/seo/torinoLandings';

/**
 * Shared shell for the public Torino landing pages (see src/lib/seo/torinoLandings.ts for why
 * they exist). A server component with no client state: every word is in the exported HTML, so
 * a crawler that never runs JavaScript still sees the full page.
 */

export function torinoLandingMetadata(landing: TorinoLanding): Metadata {
  const url = torinoLandingUrl(landing.slug);
  return {
    title: landing.title,
    description: landing.description,
    keywords: landing.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: landing.title,
      description: landing.description,
      url,
      siteName: 'Vfitfunlife',
      locale: 'it_IT',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: landing.title, description: landing.description },
    robots: { index: true, follow: true },
  };
}

function StructuredData({ landing }: { landing: TorinoLanding }) {
  const url = torinoLandingUrl(landing.slug);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              '@id': url,
              url,
              name: landing.title,
              description: landing.description,
              inLanguage: 'it-IT',
              isPartOf: { '@id': 'https://vfit-funlife.web.app/#website' },
              about: { '@id': 'https://vfit-funlife.web.app/#organization' },
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Vfitfunlife', item: 'https://vfit-funlife.web.app/' },
                { '@type': 'ListItem', position: 2, name: landing.h1, item: url },
              ],
            },
            {
              '@type': 'FAQPage',
              mainEntity: landing.faq.map((entry) => ({
                '@type': 'Question',
                name: entry.question,
                acceptedAnswer: { '@type': 'Answer', text: entry.answer },
              })),
            },
          ],
        }),
      }}
    />
  );
}

function RelatedLinks({ landing }: { landing: TorinoLanding }) {
  const related = landing.related
    .map((slug) => findTorinoLanding(slug))
    .filter((page): page is TorinoLanding => Boolean(page));

  return (
    <nav aria-label="Altre categorie" className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">Continua a esplorare</h2>
      <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {related.map((page) => (
          <li key={page.slug}>
            <Link
              href={`/${page.slug}/`}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-hairline bg-surface-elevated px-4 text-sm font-semibold text-content transition hover:border-[var(--section-primary)]"
            >
              {page.h1}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TorinoLandingPage({ landing, children }: { landing: TorinoLanding; children?: ReactNode }) {
  return (
    <main className="min-h-screen bg-surface">
      <StructuredData landing={landing} />

      <header className="border-b border-hairline bg-surface-elevated">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-display text-xl font-black text-content">
            Vfitfunlife
          </Link>
          <Link
            href="/auth/register?as=customer"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-section-gradient px-4 text-sm font-bold text-white shadow-lg"
          >
            Registrati
          </Link>
        </div>
      </header>

      <section className="border-b border-hairline bg-surface-elevated px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <nav aria-label="Percorso" className="text-xs font-semibold text-content-muted">
            <Link href="/" className="hover:underline">
              Vfitfunlife
            </Link>
            <span aria-hidden> / </span>
            <span>{landing.h1}</span>
          </nav>

          <h1 className="mt-4 font-display text-3xl font-black leading-tight text-content sm:text-5xl">
            {landing.h1}
          </h1>
          <p className="mt-4 text-lg leading-8 text-content-muted">{landing.intro}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={landing.appHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-section-gradient px-6 text-base font-semibold text-white shadow-lg"
            >
              {landing.appLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-hairline px-6 text-base font-semibold text-content"
            >
              Cos’è Vfitfunlife
            </Link>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-content-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Pilota attivo a Torino · pagamenti gestiti con Stripe
          </p>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
          {landing.sections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-hairline bg-surface-elevated p-5">
              <h2 className="font-semibold text-content">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-content-muted">{section.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-hairline bg-surface-elevated px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-black text-content">Domande frequenti</h2>
          <dl className="mt-6 space-y-5">
            {landing.faq.map((entry) => (
              <div key={entry.question}>
                <dt className="font-semibold text-content">{entry.question}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-content-muted">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-hairline bg-surface-elevated p-6">
            <h2 className="flex items-center gap-2 font-semibold text-content">
              <ShieldCheck className="h-5 w-5 text-[var(--section-primary)]" aria-hidden />
              Sei un professionista di Torino?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-content-muted">
              Se gestisci un centro, una palestra o lavori come personal trainer, puoi pubblicare i tuoi servizi
              su Vfitfunlife senza canone durante il pilota: prenotazioni, agenda e pagamenti restano tracciati.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/diventa-trainer/"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-hairline px-5 text-sm font-semibold text-content"
              >
                Candidati come trainer
              </Link>
              <Link
                href="/auth/register?as=provider"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-section-gradient px-5 text-sm font-semibold text-white"
              >
                Registrati come provider
              </Link>
            </div>
          </div>

          <RelatedLinks landing={landing} />

          <nav aria-label="Altre categorie Vfitfunlife" className="mt-8 text-xs text-content-muted">
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {TORINO_LANDINGS.filter((page) => page.slug !== landing.slug).map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}/`} className="hover:underline">
                    {page.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-8 text-xs text-content-muted">
            Vfitfunlife · <Link href="/privacy/" className="hover:underline">Privacy</Link> ·{' '}
            <Link href="/terms/" className="hover:underline">Termini</Link>
          </p>
        </div>
      </section>

      {children}
    </main>
  );
}
